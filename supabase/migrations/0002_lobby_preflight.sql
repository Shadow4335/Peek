-- =============================================================================
-- Phase 4 — lobby pre-flight
--   * start_match only counts a player as ready if their GPS check is fresh
--     (ready_checked_at within 120 s). Clients re-verify every 30 s while ready.
--   * leave_room: leave the lobby; host role passes to the earliest joiner, and an
--     empty room is deleted.
-- Constants mirror packages/shared/src/constants.ts (READY_FRESH_MS).
-- =============================================================================

create or replace function public.start_match(p_room_id uuid, p_force boolean default false)
returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare
  c_ready_fresh constant interval := interval '120 seconds';
  v_uid         uuid := public._require_uid();
  v_room        public.rooms;
  v_ready_seek  int;
  v_ready_hide  int;
  v_not_ready   int;
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

  -- A stale GPS check no longer counts as ready.
  update public.players
     set is_ready = false
   where room_id = p_room_id
     and is_ready
     and (ready_checked_at is null or ready_checked_at < now() - c_ready_fresh);

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

create function public.leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := public._require_uid();
  v_room   public.rooms;
  v_player public.players;
  v_next   public.players;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'LOBBY' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;

  delete from public.players
   where room_id = p_room_id and user_id = v_uid
  returning * into v_player;
  if not found then
    return;
  end if;

  if v_player.is_host then
    select * into v_next from public.players
     where room_id = p_room_id
     order by joined_at, id
     limit 1
     for update;
    if found then
      update public.players set is_host = true where id = v_next.id;
      update public.rooms set host_user_id = v_next.user_id where id = p_room_id;
    else
      delete from public.rooms where id = p_room_id;
    end if;
  end if;
end $$;

revoke execute on function public.leave_room(uuid) from public, anon;
grant execute on function public.leave_room(uuid) to authenticated, service_role;
