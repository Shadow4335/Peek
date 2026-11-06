-- =============================================================================
-- IRL Hide & Seek — initial schema
--   Tables : rooms, players, hider_telemetry, ping_snapshots, tag_attempts
--   RLS    : members read their room; seekers have ZERO access to hider_telemetry
--   RPCs   : create_room, join_room, claim_lobby_role, set_player_ready,
--            start_match, self_surrender                       (authenticated)
--            attempt_proximity_tag, confirm_manual_tag,
--            record_ping_wave, transition_room_status           (service_role)
-- Constants mirror packages/shared/src/constants.ts — change both together.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.room_status  as enum ('LOBBY', 'HEAD_START', 'ACTIVE', 'ENDED');
create type public.player_role  as enum ('UNASSIGNED', 'HIDER', 'SEEKER');
create type public.match_winner as enum ('HIDERS', 'SEEKERS');
create type public.catch_method as enum ('PROXIMITY', 'SELF_SURRENDER', 'TAG_REQUEST');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.rooms (
  id                      uuid primary key default gen_random_uuid(),
  code                    char(6) not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id            uuid not null,
  status                  public.room_status not null default 'LOBBY',

  max_players             int not null check (max_players between 2 and 50),
  seeker_count            int not null check (seeker_count >= 1),
  game_duration_mins      int not null check (game_duration_mins between 5 and 240),
  head_start_secs         int not null check (head_start_secs between 0 and 1800),
  ping_interval_min_secs  int not null check (ping_interval_min_secs between 30 and 1800),
  ping_interval_max_secs  int not null check (ping_interval_max_secs between 30 and 1800),

  geofence                jsonb not null,           -- GeoJSON Polygon (as drawn)
  geofence_buffered       jsonb not null,           -- GeoJSON Polygon|MultiPolygon (+12 m)
  geofence_area_m2        double precision not null check (geofence_area_m2 > 0 and geofence_area_m2 <= 50000000),

  head_start_ends_at      timestamptz,
  started_at              timestamptz,
  ends_at                 timestamptz,
  ended_at                timestamptz,
  winner                  public.match_winner,
  ping_wave_count         int not null default 0,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint seekers_lt_max   check (seeker_count < max_players),
  constraint ping_range_valid check (ping_interval_min_secs <= ping_interval_max_secs),
  constraint geofence_is_polygon check (geofence->>'type' = 'Polygon'),
  constraint buffered_is_polygonal check (geofence_buffered->>'type' in ('Polygon', 'MultiPolygon'))
);

create table public.players (
  id                    uuid primary key default gen_random_uuid(),
  room_id               uuid not null references public.rooms(id) on delete cascade,
  user_id               uuid not null,
  display_name          text not null check (char_length(display_name) between 1 and 24),
  role                  public.player_role not null default 'UNASSIGNED',
  is_host               boolean not null default false,
  is_ready              boolean not null default false,
  ready_checked_at      timestamptz,

  caught_at             timestamptz,
  caught_by_player_id   uuid references public.players(id) on delete set null,
  catch_method          public.catch_method,
  catches_count         int not null default 0,

  last_failed_tag_at    timestamptz,
  exposed_until         timestamptz,
  out_of_bounds_since   timestamptz,

  last_seen_at          timestamptz not null default now(),
  joined_at             timestamptz not null default now(),

  unique (room_id, user_id)
);
create index players_room_idx on public.players (room_id);
create index players_user_idx on public.players (user_id);

-- Latest fix per hider (upserted every ~10 s). NOT in the Realtime publication.
create table public.hider_telemetry (
  player_id   uuid primary key references public.players(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  double precision not null check (accuracy_m >= 0),
  battery     real check (battery is null or battery between 0 and 1),
  updated_at  timestamptz not null default now()
);
create index hider_telemetry_room_idx on public.hider_telemetry (room_id);

create table public.ping_snapshots (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  wave_number   int not null,
  player_id     uuid not null references public.players(id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    double precision not null,
  stale         boolean not null default false,
  heartbeat_at  timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (room_id, wave_number, player_id)
);
create index ping_snapshots_room_wave_idx on public.ping_snapshots (room_id, wave_number);

-- Audit log for tags (holds distances — service role only, never exposed).
create table public.tag_attempts (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.rooms(id) on delete cascade,
  seeker_player_id  uuid not null references public.players(id) on delete cascade,
  hider_player_id   uuid not null references public.players(id) on delete cascade,
  result            text not null,
  counts_as_strike  boolean not null default false,
  d_raw_m           double precision,
  d_discount_m      double precision,
  d_effective_m     double precision,
  hider_fix_age_s   double precision,
  created_at        timestamptz not null default now()
);
create index tag_attempts_seeker_idx on public.tag_attempts (seeker_player_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create function public.tg_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger rooms_touch before update on public.rooms
  for each row execute function public.tg_touch_updated_at();

-- A fix may never claim to be fresher than "now" (prevents future-dating telemetry).
create function public.tg_clamp_telemetry_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := least(coalesce(new.updated_at, now()), now());
  return new;
end $$;

create trigger hider_telemetry_clamp before insert or update on public.hider_telemetry
  for each row execute function public.tg_clamp_telemetry_time();

-- -----------------------------------------------------------------------------
-- Math helpers
-- -----------------------------------------------------------------------------

-- Great-circle distance in meters. R = 6 371 008.8 m (same as Turf).
create function public.haversine_m(lat1 double precision, lng1 double precision,
                                   lat2 double precision, lng2 double precision)
returns double precision
language sql immutable strict parallel safe set search_path = '' as $$
  select 2 * 6371008.8 * atan2(sqrt(a), sqrt(1 - a))
  from (
    select power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2) as a
  ) s
$$;

-- Ray-casting point-in-ring. ring = GeoJSON linear ring [[lng,lat], ...].
create function public.point_in_ring(p_lng double precision, p_lat double precision, ring jsonb)
returns boolean
language plpgsql immutable strict parallel safe set search_path = '' as $$
declare
  n int := jsonb_array_length(ring);
  inside boolean := false;
  i int;
  j int := n - 1;
  xi double precision; yi double precision;
  xj double precision; yj double precision;
begin
  for i in 0 .. n - 1 loop
    xi := (ring->i->>0)::double precision; yi := (ring->i->>1)::double precision;
    xj := (ring->j->>0)::double precision; yj := (ring->j->>1)::double precision;
    if ((yi > p_lat) <> (yj > p_lat))
       and (p_lng < (xj - xi) * (p_lat - yi) / (yj - yi) + xi) then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end $$;

-- Polygon coordinates = [outer, hole1, hole2, ...].
create function public.point_in_polygon_coords(p_lng double precision, p_lat double precision, coords jsonb)
returns boolean
language plpgsql immutable strict parallel safe set search_path = '' as $$
declare
  k int;
begin
  if jsonb_array_length(coords) = 0 or not public.point_in_ring(p_lng, p_lat, coords->0) then
    return false;
  end if;
  for k in 1 .. jsonb_array_length(coords) - 1 loop
    if public.point_in_ring(p_lng, p_lat, coords->k) then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- Accepts GeoJSON Polygon, MultiPolygon or a Feature wrapping one.
create function public.point_in_geojson(p_lat double precision, p_lng double precision, geom jsonb)
returns boolean
language plpgsql immutable strict parallel safe set search_path = '' as $$
declare
  part jsonb;
begin
  if geom->>'type' = 'Feature' then
    return public.point_in_geojson(p_lat, p_lng, geom->'geometry');
  elsif geom->>'type' = 'Polygon' then
    return public.point_in_polygon_coords(p_lng, p_lat, geom->'coordinates');
  elsif geom->>'type' = 'MultiPolygon' then
    for part in select * from jsonb_array_elements(geom->'coordinates') loop
      if public.point_in_polygon_coords(p_lng, p_lat, part) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end $$;

-- -----------------------------------------------------------------------------
-- RLS helpers (security definer → no policy recursion)
-- -----------------------------------------------------------------------------
create function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players
    where room_id = p_room_id and user_id = auth.uid()
  )
$$;

create function public.is_own_hider_row(p_player_id uuid, p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.players p
    join public.rooms r on r.id = p.room_id
    where p.id = p_player_id
      and p.room_id = p_room_id
      and p.user_id = auth.uid()
      and p.role = 'HIDER'
      and p.caught_at is null
      and r.status in ('HEAD_START', 'ACTIVE')
  )
$$;

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.rooms           enable row level security;
alter table public.players         enable row level security;
alter table public.hider_telemetry enable row level security;
alter table public.ping_snapshots  enable row level security;
alter table public.tag_attempts    enable row level security;

-- All writes to rooms/players/ping_snapshots/tag_attempts go through RPCs or the
-- service role. Strip direct DML from client roles as defense in depth.
revoke all on public.rooms, public.players, public.hider_telemetry,
              public.ping_snapshots, public.tag_attempts from anon, authenticated;
grant all on public.rooms, public.players, public.hider_telemetry,
             public.ping_snapshots, public.tag_attempts to service_role;
grant select on public.rooms, public.players, public.ping_snapshots to authenticated;
grant select, insert, update on public.hider_telemetry to authenticated;

create policy rooms_select_members on public.rooms
  for select to authenticated using (public.is_room_member(id));

create policy players_select_room_members on public.players
  for select to authenticated using (public.is_room_member(room_id));

create policy ping_snapshots_select_members on public.ping_snapshots
  for select to authenticated using (public.is_room_member(room_id));

-- hider_telemetry: ONLY the owning (uncaught, in-match) hider. No seeker policy exists,
-- so seekers — and everyone else — get zero rows.
create policy hider_telemetry_select_own on public.hider_telemetry
  for select to authenticated using (public.is_own_hider_row(player_id, room_id));
create policy hider_telemetry_insert_own on public.hider_telemetry
  for insert to authenticated with check (public.is_own_hider_row(player_id, room_id));
create policy hider_telemetry_update_own on public.hider_telemetry
  for update to authenticated
  using (public.is_own_hider_row(player_id, room_id))
  with check (public.is_own_hider_row(player_id, room_id));

-- tag_attempts: RLS on, no policies → service role only.

-- -----------------------------------------------------------------------------
-- Internal helpers
-- -----------------------------------------------------------------------------
create function public._require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return v;
end $$;

create function public._validate_polygonal(geom jsonb, allow_multi boolean) returns void
language plpgsql immutable set search_path = '' as $$
declare
  ring jsonb;
begin
  if geom is null or jsonb_typeof(geom) <> 'object' then
    raise exception 'INVALID_GEOFENCE';
  end if;
  if geom->>'type' = 'Polygon' then
    ring := geom->'coordinates'->0;
    if ring is null or jsonb_typeof(ring) <> 'array' or jsonb_array_length(ring) < 4
       or jsonb_array_length(ring) > 1000 then
      raise exception 'INVALID_GEOFENCE';
    end if;
  elsif allow_multi and geom->>'type' = 'MultiPolygon' then
    if jsonb_typeof(geom->'coordinates') <> 'array' or jsonb_array_length(geom->'coordinates') = 0 then
      raise exception 'INVALID_GEOFENCE';
    end if;
  else
    raise exception 'INVALID_GEOFENCE';
  end if;
end $$;

-- Marks a hider caught and ends the match if no hiders remain.
-- Caller must already hold FOR UPDATE on the room row.
create function public._apply_catch(p_room_id uuid, p_hider_id uuid,
                                    p_seeker_id uuid, p_method public.catch_method)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_updated int;
  v_remaining int;
  v_ended boolean := false;
begin
  update public.players
     set caught_at = now(), caught_by_player_id = p_seeker_id, catch_method = p_method
   where id = p_hider_id and room_id = p_room_id and role = 'HIDER' and caught_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('caught', false, 'match_ended', false);
  end if;

  if p_seeker_id is not null then
    update public.players set catches_count = catches_count + 1 where id = p_seeker_id;
  end if;

  delete from public.hider_telemetry where player_id = p_hider_id;

  select count(*) into v_remaining
    from public.players
   where room_id = p_room_id and role = 'HIDER' and caught_at is null;

  if v_remaining = 0 then
    update public.rooms
       set status = 'ENDED', ended_at = now(), winner = 'SEEKERS'
     where id = p_room_id and status in ('HEAD_START', 'ACTIVE');
    v_ended := true;
  end if;

  return jsonb_build_object(
    'caught', true,
    'match_ended', v_ended,
    'winner', case when v_ended then 'SEEKERS' end,
    'hiders_remaining', v_remaining
  );
end $$;

-- -----------------------------------------------------------------------------
-- Client-facing RPCs (authenticated; identity = auth.uid())
-- -----------------------------------------------------------------------------

create function public.create_room(
  p_display_name           text,
  p_max_players            int,
  p_seeker_count           int,
  p_game_duration_mins     int,
  p_head_start_secs        int,
  p_ping_interval_min_secs int,
  p_ping_interval_max_secs int,
  p_geofence               jsonb,
  p_geofence_buffered      jsonb,
  p_geofence_area_m2       double precision
) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := public._require_uid();
  v_name text := btrim(p_display_name);
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_room public.rooms;
  v_attempt int := 0;
begin
  perform public._validate_polygonal(p_geofence, false);
  perform public._validate_polygonal(p_geofence_buffered, true);

  loop
    v_attempt := v_attempt + 1;
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code
      from generate_series(1, 6);
    begin
      insert into public.rooms (
        code, host_user_id, max_players, seeker_count, game_duration_mins, head_start_secs,
        ping_interval_min_secs, ping_interval_max_secs,
        geofence, geofence_buffered, geofence_area_m2
      ) values (
        v_code, v_uid, p_max_players, p_seeker_count, p_game_duration_mins, p_head_start_secs,
        p_ping_interval_min_secs, p_ping_interval_max_secs,
        p_geofence, p_geofence_buffered, p_geofence_area_m2
      ) returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception 'ROOM_CODE_EXHAUSTED';
      end if;
    end;
  end loop;

  insert into public.players (room_id, user_id, display_name, is_host)
  values (v_room.id, v_uid, v_name, true);

  return v_room;
end $$;

create function public.join_room(p_code text, p_display_name text)
returns public.players
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := public._require_uid();
  v_room   public.rooms;
  v_player public.players;
  v_count  int;
begin
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- Rejoin (any status) is idempotent.
  select * into v_player from public.players where room_id = v_room.id and user_id = v_uid;
  if found then
    update public.players set last_seen_at = now() where id = v_player.id returning * into v_player;
    return v_player;
  end if;

  if v_room.status <> 'LOBBY' then
    raise exception 'ROOM_NOT_JOINABLE';
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= v_room.max_players then
    raise exception 'ROOM_FULL';
  end if;

  insert into public.players (room_id, user_id, display_name)
  values (v_room.id, v_uid, btrim(p_display_name))
  returning * into v_player;
  return v_player;
end $$;

-- Atomic slot claim. The room row lock serializes every claim in the room, so
-- concurrent taps can never exceed seeker_count / (max_players - seeker_count).
create function public.claim_lobby_role(p_room_id uuid, p_role public.player_role)
returns public.players
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := public._require_uid();
  v_room   public.rooms;
  v_player public.players;
  v_taken  int;
  v_cap    int;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'LOBBY' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;

  select * into v_player from public.players
   where room_id = p_room_id and user_id = v_uid for update;
  if not found then
    raise exception 'NOT_IN_ROOM';
  end if;

  if v_player.role = p_role then
    return v_player;
  end if;

  if p_role <> 'UNASSIGNED' then
    v_cap := case p_role when 'SEEKER' then v_room.seeker_count
                         else v_room.max_players - v_room.seeker_count end;
    select count(*) into v_taken from public.players
     where room_id = p_room_id and role = p_role and id <> v_player.id;
    if v_taken >= v_cap then
      raise exception 'ROLE_FULL';
    end if;
  end if;

  update public.players
     set role = p_role, is_ready = false, ready_checked_at = null
   where id = v_player.id
  returning * into v_player;
  return v_player;
end $$;

-- Ready requires a claimed role and a live fix (accuracy ≤ 30 m) inside the
-- 12 m drift-buffered geofence.
create function public.set_player_ready(
  p_room_id uuid, p_ready boolean,
  p_lat double precision default null, p_lng double precision default null,
  p_accuracy_m double precision default null
) returns public.players
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := public._require_uid();
  v_room   public.rooms;
  v_player public.players;
begin
  -- FOR SHARE: serializes with start_match (which holds FOR UPDATE).
  select * into v_room from public.rooms where id = p_room_id for share;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'LOBBY' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;

  select * into v_player from public.players
   where room_id = p_room_id and user_id = v_uid for update;
  if not found then
    raise exception 'NOT_IN_ROOM';
  end if;

  if p_ready then
    if v_player.role = 'UNASSIGNED' then
      raise exception 'ROLE_REQUIRED';
    end if;
    if p_lat is null or p_lng is null or p_accuracy_m is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'GPS_REQUIRED';
    end if;
    if p_accuracy_m > 30 then
      raise exception 'GPS_ACCURACY_TOO_LOW';
    end if;
    if not public.point_in_geojson(p_lat, p_lng, v_room.geofence_buffered) then
      raise exception 'OUTSIDE_PLAY_ZONE';
    end if;
  end if;

  update public.players
     set is_ready = p_ready,
         ready_checked_at = case when p_ready then now() end,
         last_seen_at = now()
   where id = v_player.id
  returning * into v_player;
  return v_player;
end $$;

-- Host only. p_force = "Start with Current Roster": needs ≥1 ready seeker and
-- ≥1 ready hider; every non-ready player is demoted to UNASSIGNED (spectator).
create function public.start_match(p_room_id uuid, p_force boolean default false)
returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_uid          uuid := public._require_uid();
  v_room         public.rooms;
  v_ready_seek   int;
  v_ready_hide   int;
  v_not_ready    int;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.host_user_id <> v_uid then
    raise exception 'NOT_HOST';
  end if;
  if v_room.status <> 'LOBBY' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;

  select count(*) filter (where role = 'SEEKER' and is_ready),
         count(*) filter (where role = 'HIDER'  and is_ready),
         count(*) filter (where role <> 'UNASSIGNED' and not is_ready)
    into v_ready_seek, v_ready_hide, v_not_ready
    from public.players where room_id = p_room_id;

  if v_ready_seek < 1 or v_ready_hide < 1 then
    raise exception 'NEED_READY_SEEKER_AND_HIDER';
  end if;

  if not p_force then
    if v_not_ready > 0 or exists (
      select 1 from public.players where room_id = p_room_id and role = 'UNASSIGNED' and not is_host
    ) then
      raise exception 'ROSTER_NOT_READY';
    end if;
  else
    update public.players
       set role = 'UNASSIGNED', is_ready = false
     where room_id = p_room_id and role <> 'UNASSIGNED' and not is_ready;
  end if;

  update public.rooms
     set status             = 'HEAD_START',
         started_at         = now(),
         head_start_ends_at = now() + make_interval(secs => head_start_secs),
         ends_at            = now() + make_interval(secs => head_start_secs)
                                    + make_interval(mins => game_duration_mins)
   where id = p_room_id
  returning * into v_room;
  return v_room;
end $$;

create function public.self_surrender(p_room_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := public._require_uid();
  v_room   public.rooms;
  v_player public.players;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'ACTIVE' then
    raise exception 'ROOM_NOT_ACTIVE';
  end if;
  select * into v_player from public.players
   where room_id = p_room_id and user_id = v_uid and role = 'HIDER' and caught_at is null;
  if not found then
    raise exception 'NOT_AN_ACTIVE_HIDER';
  end if;
  return public._apply_catch(p_room_id, v_player.id, null, 'SELF_SURRENDER');
end $$;

-- -----------------------------------------------------------------------------
-- Service-role RPCs (Render server only)
-- -----------------------------------------------------------------------------

-- Option C: uncertainty-adjusted proximity tag.
--   d_raw       = haversine(seeker, hider)
--   d_discount  = min(σ_seeker + σ_hider, 20 m)
--   d_effective = max(0, d_raw − d_discount)
--   TAGGED      iff d_effective ≤ 15 m
-- Unless p_fresh_fix_attempted, returns NEEDS_FRESH_FIX (no penalty) when the
-- hider fix is > 10 s old or 15 m < d_effective ≤ 40 m; the server then emits
-- FORCE_GPS_FLUSH, waits ≤ 2 s, and calls again with p_fresh_fix_attempted = true.
-- Failures: generic OUT_OF_RANGE (no distances), 20 s cooldown, and ≥ 2 strikes in
-- 60 s exposes the seeker for 30 s. Distances are written only to tag_attempts.
create function public.attempt_proximity_tag(
  p_room_id             uuid,
  p_seeker_player_id    uuid,
  p_hider_player_id     uuid,
  p_seeker_lat          double precision,
  p_seeker_lng          double precision,
  p_seeker_accuracy_m   double precision,
  p_fresh_fix_attempted boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_cooldown   constant interval := interval '20 seconds';
  c_strike_win constant interval := interval '60 seconds';
  c_exposure   constant interval := interval '30 seconds';
  c_fresh_age  constant double precision := 10;
  c_max_disc   constant double precision := 20;
  c_threshold  constant double precision := 15;
  c_borderline constant double precision := 40;

  v_room     public.rooms;
  v_seeker   public.players;
  v_hider    public.players;
  v_tel      public.hider_telemetry;
  v_age_s    double precision;
  v_raw      double precision;
  v_disc     double precision;
  v_eff      double precision;
  v_strikes  int;
  v_strike   boolean;
  v_exposed  timestamptz;
  v_catch    jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'ACTIVE' or now() >= v_room.ends_at then
    return jsonb_build_object('result', 'INVALID', 'reason', 'ROOM_NOT_ACTIVE');
  end if;

  select * into v_seeker from public.players
   where id = p_seeker_player_id and room_id = p_room_id and role = 'SEEKER' for update;
  if not found then
    return jsonb_build_object('result', 'INVALID', 'reason', 'NOT_A_SEEKER');
  end if;

  if v_seeker.last_failed_tag_at is not null
     and v_seeker.last_failed_tag_at + c_cooldown > now() then
    return jsonb_build_object('result', 'COOLDOWN',
                              'cooldown_until', v_seeker.last_failed_tag_at + c_cooldown);
  end if;

  select * into v_hider from public.players
   where id = p_hider_player_id and room_id = p_room_id and role = 'HIDER' and caught_at is null
   for update;
  if not found then
    return jsonb_build_object('result', 'INVALID', 'reason', 'HIDER_UNAVAILABLE');
  end if;

  if p_seeker_lat is null or p_seeker_lng is null
     or p_seeker_lat not between -90 and 90 or p_seeker_lng not between -180 and 180 then
    return jsonb_build_object('result', 'INVALID', 'reason', 'BAD_SEEKER_FIX');
  end if;

  select * into v_tel from public.hider_telemetry where player_id = p_hider_player_id;

  if found then
    v_age_s := extract(epoch from (now() - v_tel.updated_at));
    v_raw   := public.haversine_m(p_seeker_lat, p_seeker_lng, v_tel.lat, v_tel.lng);
    v_disc  := least(greatest(coalesce(p_seeker_accuracy_m, 0), 0)
                     + greatest(v_tel.accuracy_m, 0), c_max_disc);
    v_eff   := greatest(0, v_raw - v_disc);
  end if;

  -- Ask the server for a fresh hider fix before judging stale / borderline cases.
  if not p_fresh_fix_attempted
     and (v_tel.player_id is null or v_age_s > c_fresh_age
          or (v_eff > c_threshold and v_eff <= c_borderline)) then
    insert into public.tag_attempts (room_id, seeker_player_id, hider_player_id, result,
                                     d_raw_m, d_discount_m, d_effective_m, hider_fix_age_s)
    values (p_room_id, p_seeker_player_id, p_hider_player_id, 'NEEDS_FRESH_FIX',
            v_raw, v_disc, v_eff, v_age_s);
    return jsonb_build_object('result', 'NEEDS_FRESH_FIX');
  end if;

  -- Success.
  if v_eff is not null and v_eff <= c_threshold then
    insert into public.tag_attempts (room_id, seeker_player_id, hider_player_id, result,
                                     d_raw_m, d_discount_m, d_effective_m, hider_fix_age_s)
    values (p_room_id, p_seeker_player_id, p_hider_player_id, 'TAGGED',
            v_raw, v_disc, v_eff, v_age_s);
    v_catch := public._apply_catch(p_room_id, p_hider_player_id, p_seeker_player_id, 'PROXIMITY');
    return jsonb_build_object('result', 'TAGGED') || v_catch;
  end if;

  -- Failure. Missing hider telemetry still costs the cooldown (indistinguishable to
  -- the client) but is not counted as a strike toward exposure.
  v_strike := v_eff is not null;
  insert into public.tag_attempts (room_id, seeker_player_id, hider_player_id, result,
                                   counts_as_strike, d_raw_m, d_discount_m, d_effective_m,
                                   hider_fix_age_s)
  values (p_room_id, p_seeker_player_id, p_hider_player_id, 'OUT_OF_RANGE',
          v_strike, v_raw, v_disc, v_eff, v_age_s);

  select count(*) into v_strikes
    from public.tag_attempts
   where seeker_player_id = p_seeker_player_id
     and counts_as_strike
     and created_at > now() - c_strike_win;

  v_exposed := v_seeker.exposed_until;
  if v_strike and v_strikes >= 2 then
    v_exposed := now() + c_exposure;
  end if;

  update public.players
     set last_failed_tag_at = now(), exposed_until = v_exposed
   where id = p_seeker_player_id;

  return jsonb_build_object(
    'result', 'OUT_OF_RANGE',
    'cooldown_until', now() + c_cooldown,
    'tag_request_eligible', true,
    -- Server-side only: drives the 30 s seeker-exposure broadcast. Strip before acking.
    'exposure_triggered', (v_strike and v_strikes >= 2),
    'exposed_until', v_exposed
  );
end $$;

-- Hider accepted a manual "Send Tag Request" within the 15 s window.
create function public.confirm_manual_tag(p_room_id uuid, p_seeker_player_id uuid,
                                          p_hider_player_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'ACTIVE' then
    return jsonb_build_object('caught', false, 'reason', 'ROOM_NOT_ACTIVE');
  end if;
  if not exists (select 1 from public.players
                  where id = p_seeker_player_id and room_id = p_room_id and role = 'SEEKER') then
    return jsonb_build_object('caught', false, 'reason', 'NOT_A_SEEKER');
  end if;
  insert into public.tag_attempts (room_id, seeker_player_id, hider_player_id, result)
  values (p_room_id, p_seeker_player_id, p_hider_player_id, 'TAG_REQUEST_ACCEPTED');
  return public._apply_catch(p_room_id, p_hider_player_id, p_seeker_player_id, 'TAG_REQUEST');
end $$;

-- Atomically snapshots every uncaught hider's latest fix as the next ping wave.
-- stale = heartbeat older than 20 s at snapshot time.
create function public.record_ping_wave(p_room_id uuid)
returns setof public.ping_snapshots
language plpgsql security definer set search_path = '' as $$
declare
  v_wave int;
begin
  update public.rooms
     set ping_wave_count = ping_wave_count + 1
   where id = p_room_id and status = 'ACTIVE'
  returning ping_wave_count into v_wave;
  if v_wave is null then
    return;
  end if;

  return query
  insert into public.ping_snapshots (room_id, wave_number, player_id, lat, lng,
                                     accuracy_m, stale, heartbeat_at)
  select p_room_id, v_wave, t.player_id, t.lat, t.lng, t.accuracy_m,
         (now() - t.updated_at) > interval '20 seconds', t.updated_at
    from public.hider_telemetry t
    join public.players p on p.id = t.player_id
   where t.room_id = p_room_id and p.role = 'HIDER' and p.caught_at is null
  returning *;
end $$;

-- Compare-and-set state transition. Returns NULL if the room was not in p_from.
create function public.transition_room_status(p_room_id uuid, p_from public.room_status,
                                              p_to public.room_status,
                                              p_winner public.match_winner default null)
returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  if not ((p_from = 'HEAD_START' and p_to = 'ACTIVE')
       or (p_from in ('LOBBY', 'HEAD_START', 'ACTIVE') and p_to = 'ENDED')) then
    raise exception 'ILLEGAL_TRANSITION % -> %', p_from, p_to;
  end if;

  update public.rooms
     set status   = p_to,
         ended_at = case when p_to = 'ENDED' then now() else ended_at end,
         winner   = case when p_to = 'ENDED' then p_winner else winner end
   where id = p_room_id and status = p_from
  returning * into v_room;
  return v_room;
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.haversine_m(double precision, double precision, double precision, double precision),
  public.point_in_geojson(double precision, double precision, jsonb),
  public.is_room_member(uuid),
  public.is_own_hider_row(uuid, uuid),
  public.create_room(text, int, int, int, int, int, int, jsonb, jsonb, double precision),
  public.join_room(text, text),
  public.claim_lobby_role(uuid, public.player_role),
  public.set_player_ready(uuid, boolean, double precision, double precision, double precision),
  public.start_match(uuid, boolean),
  public.self_surrender(uuid)
to authenticated;

grant execute on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Realtime (hider_telemetry deliberately excluded)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rooms, public.players, public.ping_snapshots;
  end if;
end $$;
