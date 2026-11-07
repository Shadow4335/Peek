-- =============================================================================
-- Friction cuts
--   * set_display_name: players get an auto-generated name and can rename in the
--     lobby instead of being forced to type one up front.
--   * create_rematch: one tap on the summary screen creates a new lobby with the same
--     zone + rules; the code is published on the old room (rooms.rematch_code) so every
--     member's screen offers "Join rematch" via Realtime. Idempotent: first caller wins.
-- =============================================================================

alter table public.rooms add column rematch_code char(6);

create function public.set_display_name(p_room_id uuid, p_display_name text)
returns public.players
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := public._require_uid();
  v_player public.players;
begin
  update public.players
     set display_name = btrim(p_display_name), last_seen_at = now()
   where room_id = p_room_id and user_id = v_uid
     and exists (select 1 from public.rooms r where r.id = p_room_id and r.status = 'LOBBY')
  returning * into v_player;
  if not found then
    if not exists (select 1 from public.players where room_id = p_room_id and user_id = v_uid) then
      raise exception 'NOT_IN_ROOM';
    end if;
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;
  return v_player;
end $$;

create function public.create_rematch(p_room_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := public._require_uid();
  v_old  public.rooms;
  v_name text;
  v_new  public.rooms;
begin
  select * into v_old from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select display_name into v_name from public.players where room_id = p_room_id and user_id = v_uid;
  if not found then
    raise exception 'NOT_IN_ROOM';
  end if;
  if v_old.status <> 'ENDED' then
    raise exception 'ROOM_NOT_ENDED';
  end if;
  if v_old.rematch_code is not null then
    return v_old.rematch_code;
  end if;

  v_new := public.create_room(
    v_name, v_old.max_players, v_old.seeker_count, v_old.game_duration_mins, v_old.head_start_secs,
    v_old.ping_interval_min_secs, v_old.ping_interval_max_secs,
    v_old.geofence, v_old.geofence_buffered, v_old.geofence_area_m2
  );
  update public.rooms set rematch_code = v_new.code where id = p_room_id;
  return v_new.code;
end $$;

revoke execute on function public.set_display_name(uuid, text) from public, anon;
revoke execute on function public.create_rematch(uuid) from public, anon;
grant execute on function public.set_display_name(uuid, text), public.create_rematch(uuid) to authenticated, service_role;
