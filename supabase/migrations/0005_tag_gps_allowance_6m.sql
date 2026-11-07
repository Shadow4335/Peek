-- =============================================================================
-- GPS drift allowance: a tag now lands within 6 m of raw (phone-reported) distance at most.
--   d_discount  = min(σ_seeker + σ_hider, 5.0856 m)   -- was 20 m
--   d_effective = max(0, d_raw − d_discount)
--   TAGGED iff d_effective ≤ 0.9144 m (3 ft)          ⇒ d_raw ≤ 6 m with good-enough σ
-- With typical ±5 m fixes the cap applies, so the effective tag range is 6 m (was ~10.9 m).
-- Otherwise identical to 0004. `create or replace` keeps the service_role-only grants.
-- =============================================================================

create or replace function public.attempt_proximity_tag(
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
  c_max_disc   constant double precision := 5.0856; -- 6 m − 3 ft
  c_threshold  constant double precision := 0.9144; -- 3 ft
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
