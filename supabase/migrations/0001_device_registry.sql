create table if not exists public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id_hash text not null check (length(device_id_hash) >= 32),
  device_name text not null check (char_length(device_name) <= 120),
  operating_system text not null check (char_length(operating_system) <= 120),
  app_version text not null check (char_length(app_version) <= 40),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists registered_devices_active_unique
  on public.registered_devices(user_id, device_id_hash)
  where revoked_at is null;

create index if not exists registered_devices_user_active_idx
  on public.registered_devices(user_id, revoked_at, last_seen_at desc);

create table if not exists public.device_authorization_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists device_authorization_attempts_recent_idx
  on public.device_authorization_attempts(user_id, attempted_at desc);

alter table public.registered_devices enable row level security;
alter table public.device_authorization_attempts enable row level security;

drop policy if exists "Users can read their own devices" on public.registered_devices;
create policy "Users can read their own devices"
  on public.registered_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Clients cannot mutate devices directly" on public.registered_devices;
create policy "Clients cannot mutate devices directly"
  on public.registered_devices
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists "No direct attempt access" on public.device_authorization_attempts;
create policy "No direct attempt access"
  on public.device_authorization_attempts
  for all
  to authenticated
  using (false)
  with check (false);

create or replace function public.active_devices_json(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'device_id_hash', device_id_hash,
        'device_name', device_name,
        'operating_system', operating_system,
        'app_version', app_version,
        'registered_at', registered_at,
        'last_seen_at', last_seen_at,
        'revoked_at', revoked_at
      )
      order by last_seen_at desc
    ),
    '[]'::jsonb
  )
  from public.registered_devices
  where user_id = p_user_id
    and revoked_at is null;
$$;

create or replace function public.register_device_atomic(
  p_user_id uuid,
  p_device_id_hash text,
  p_device_name text,
  p_operating_system text,
  p_app_version text,
  p_lease_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_active_count integer;
  v_recent_attempts integer;
  v_devices jsonb;
begin
  if p_user_id is null then
    raise exception 'user is required';
  end if;

  if p_device_id_hash is null or length(p_device_id_hash) < 32 then
    raise exception 'device_id_hash is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  insert into public.device_authorization_attempts(user_id, device_id_hash)
  values (p_user_id, p_device_id_hash);

  select count(*)
    into v_recent_attempts
    from public.device_authorization_attempts
    where user_id = p_user_id
      and attempted_at > now() - interval '1 hour';

  if v_recent_attempts > 30 then
    return jsonb_build_object(
      'authorized', false,
      'reason', 'Too many device authorization attempts. Try again later.',
      'devices', public.active_devices_json(p_user_id)
    );
  end if;

  select id
    into v_existing_id
    from public.registered_devices
    where user_id = p_user_id
      and device_id_hash = p_device_id_hash
      and revoked_at is null
    limit 1;

  if v_existing_id is not null then
    update public.registered_devices
      set last_seen_at = now(),
          device_name = left(p_device_name, 120),
          operating_system = left(p_operating_system, 120),
          app_version = left(p_app_version, 40)
      where id = v_existing_id;

    return jsonb_build_object(
      'authorized', true,
      'authorizedUntil', now() + make_interval(hours => p_lease_hours),
      'devices', public.active_devices_json(p_user_id)
    );
  end if;

  select count(*)
    into v_active_count
    from public.registered_devices
    where user_id = p_user_id
      and revoked_at is null;

  if v_active_count >= 2 then
    return jsonb_build_object(
      'authorized', false,
      'reason', 'This account already has two active devices. Revoke one device to continue.',
      'devices', public.active_devices_json(p_user_id)
    );
  end if;

  insert into public.registered_devices(user_id, device_id_hash, device_name, operating_system, app_version)
  values (p_user_id, p_device_id_hash, left(p_device_name, 120), left(p_operating_system, 120), left(p_app_version, 40));

  return jsonb_build_object(
    'authorized', true,
    'authorizedUntil', now() + make_interval(hours => p_lease_hours),
    'devices', public.active_devices_json(p_user_id)
  );
end;
$$;

grant execute on function public.active_devices_json(uuid) to service_role;
grant execute on function public.register_device_atomic(uuid, text, text, text, text, integer) to service_role;
