-- Opt-in cloud storage. Every mutation goes through a validated, account-scoped RPC.
create schema if not exists dailycheck_private;
revoke all on schema dailycheck_private from public, anon;
grant usage on schema dailycheck_private to authenticated;

create table public.cloud_accounts (
  owner uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  timezone text not null,
  revision bigint not null default 0 check (revision >= 0)
);
create table public.cloud_grants (
  owner uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  can_create boolean not null default false,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner, client_id)
);
create table public.cloud_entities (
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('task', 'completion')),
  id text not null check (length(id) between 1 and 160),
  payload jsonb not null,
  revision bigint not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  origin text not null check (origin in ('desktop', 'mcp')),
  primary key (owner, kind, id)
);
create table public.cloud_changes (
  owner uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  kind text not null,
  id text not null,
  payload jsonb not null,
  deleted boolean not null,
  updated_at timestamptz not null,
  origin text not null,
  primary key (owner, revision)
);
create index cloud_snapshot_idx on public.cloud_changes(owner, kind, id, revision desc);
create table public.cloud_operations (
  owner uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner, operation_id)
);
create index cloud_operations_rate_idx on public.cloud_operations(owner, created_at);

alter table public.cloud_accounts enable row level security;
alter table public.cloud_grants enable row level security;
alter table public.cloud_entities enable row level security;
alter table public.cloud_changes enable row level security;
alter table public.cloud_operations enable row level security;
revoke all on public.cloud_accounts, public.cloud_grants, public.cloud_entities, public.cloud_changes, public.cloud_operations from public, anon, authenticated;
grant select on public.cloud_accounts, public.cloud_grants, public.cloud_entities, public.cloud_changes to authenticated;

-- An integration grant covers task data, not desktop device identifiers.
drop policy if exists "Users can read their own devices" on public.registered_devices;
create policy "Users can read their own devices" on public.registered_devices for select to authenticated
  using (user_id = (select auth.uid()) and nullif(auth.jwt()->>'client_id', '') is null);

create function dailycheck_private.can_access(p_create boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from public.cloud_accounts a where a.owner = auth.uid() and a.enabled)
    and (nullif(auth.jwt()->>'client_id', '') is null or exists (
      select 1 from public.cloud_grants g where g.owner = auth.uid()
      and g.client_id::text = auth.jwt()->>'client_id' and g.revoked_at is null
      and (not p_create or g.can_create)
    ));
$$;
revoke all on function dailycheck_private.can_access(boolean) from public;
grant execute on function dailycheck_private.can_access(boolean) to authenticated;

create policy cloud_account_read on public.cloud_accounts for select to authenticated
  using (owner = (select auth.uid()) and dailycheck_private.can_access(false));
create policy cloud_grant_read on public.cloud_grants for select to authenticated
  using (owner = (select auth.uid()) and nullif(auth.jwt()->>'client_id', '') is null);
create policy cloud_entity_read on public.cloud_entities for select to authenticated
  using (owner = (select auth.uid()) and dailycheck_private.can_access(false));
create policy cloud_change_read on public.cloud_changes for select to authenticated
  using (owner = (select auth.uid()) and nullif(auth.jwt()->>'client_id', '') is null and dailycheck_private.can_access(false));

create function dailycheck_private.desktop_guard(p_device_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or nullif(auth.jwt()->>'client_id', '') is not null then
    raise exception 'Desktop session required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.registered_devices where user_id = auth.uid()
    and device_id_hash = p_device_hash and revoked_at is null) then
    raise exception 'This installation is not authorized' using errcode = '42501';
  end if;
end;
$$;
revoke all on function dailycheck_private.desktop_guard(text) from public, anon, authenticated;

create function public.cloud_configure(p_enabled boolean, p_timezone text, p_device_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform dailycheck_private.desktop_guard(p_device_hash);
  if p_enabled is null or p_timezone is null or not exists (
    select 1 from pg_timezone_names where name = p_timezone
  ) then raise exception 'Invalid cloud configuration' using errcode = '22023'; end if;
  insert into public.cloud_accounts(owner, enabled, timezone) values (auth.uid(), p_enabled, p_timezone)
    on conflict (owner) do update set enabled = excluded.enabled, timezone = excluded.timezone;
  return (select to_jsonb(a) - 'owner' from public.cloud_accounts a where owner = auth.uid());
end;
$$;

create function public.cloud_set_grant(p_client_id uuid, p_can_create boolean, p_revoke boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Called by the user's web consent screen or desktop; OAuth clients cannot grant themselves access.
  if auth.uid() is null or nullif(auth.jwt()->>'client_id', '') is not null or p_client_id is null
    or p_can_create is null or p_revoke is null then raise exception 'User session required' using errcode = '42501'; end if;
  if not exists (select 1 from public.cloud_accounts where owner = auth.uid() and (enabled or p_revoke)) then
    raise exception 'Enable cloud sync in DailyCheck first' using errcode = '42501'; end if;
  insert into public.cloud_grants(owner, client_id, can_create, revoked_at)
    values (auth.uid(), p_client_id, p_can_create, case when p_revoke then now() end)
    on conflict (owner, client_id) do update set can_create = excluded.can_create,
      revoked_at = excluded.revoked_at, updated_at = now();
end;
$$;

create function dailycheck_private.valid_date(p_date text) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  return coalesce(p_date ~ '^\d{4}-\d{2}-\d{2}$' and to_char(p_date::date, 'YYYY-MM-DD') = p_date, false);
exception when others then return false;
end;
$$;
revoke all on function dailycheck_private.valid_date(text) from public, anon, authenticated;

create function dailycheck_private.validate_entity(p_kind text, p_id text, p_data jsonb)
returns void language plpgsql set search_path = '' as $$
declare v_key text; v_day jsonb; v_task_id text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or p_data->>'id' is distinct from p_id then
    raise exception 'Invalid record' using errcode = '22023'; end if;
  if jsonb_typeof(p_data->'updatedAt') is distinct from 'string' then raise exception 'Invalid update timestamp' using errcode = '22023'; end if;
  if p_kind = 'task' then
    if p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(p_data->'name') is distinct from 'string'
      or length(btrim(p_data->>'name')) not between 1 and 200
      or not dailycheck_private.valid_date(p_data->>'createdAt')
      or (p_data ? 'description' and (jsonb_typeof(p_data->'description') <> 'string' or length(p_data->>'description') > 4000))
      or (p_data ? 'archivedAt' and not dailycheck_private.valid_date(p_data->>'archivedAt'))
      or jsonb_typeof(p_data->'recurrence') is distinct from 'object'
      or p_data->'recurrence'->>'frequency' is distinct from 'daily'
      or jsonb_typeof(p_data->'recurrence'->'weekdays') is distinct from 'array'
      or jsonb_array_length(p_data->'recurrence'->'weekdays') not between 1 and 7 then
      raise exception 'Invalid task fields' using errcode = '22023'; end if;
    for v_day in select value from jsonb_array_elements(p_data->'recurrence'->'weekdays') loop
      if jsonb_typeof(v_day) <> 'number' or v_day::text !~ '^[0-6]$' then raise exception 'Invalid weekday' using errcode = '22023'; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(p_data->'recurrence'->'weekdays'))
      <> jsonb_array_length(p_data->'recurrence'->'weekdays') then raise exception 'Duplicate weekday' using errcode = '22023'; end if;
    for v_key in select jsonb_object_keys(p_data->'recurrence') loop
      if v_key not in ('frequency', 'weekdays') then raise exception 'Unknown recurrence field' using errcode = '22023'; end if;
    end loop;
    for v_key in select jsonb_object_keys(p_data) loop
      if v_key not in ('id', 'name', 'description', 'createdAt', 'updatedAt', 'archivedAt', 'recurrence') then
        raise exception 'Unknown task field' using errcode = '22023'; end if;
    end loop;
  elsif p_kind = 'completion' then
    v_task_id := p_data->>'taskId';
    if not dailycheck_private.valid_date(p_data->>'date') or jsonb_typeof(p_data->'completed') is distinct from 'boolean'
      or p_id is distinct from (auth.uid()::text || ':' || v_task_id || ':' || (p_data->>'date'))
      or jsonb_typeof(p_data->'taskNameSnapshot') is distinct from 'string'
      or length(p_data->>'taskNameSnapshot') not between 1 and 200
      or not exists(select 1 from public.cloud_entities where owner = auth.uid() and kind = 'task' and id = v_task_id and not deleted) then
      raise exception 'Invalid completion or missing task' using errcode = '22023'; end if;
    for v_key in select jsonb_object_keys(p_data) loop
      if v_key not in ('id', 'taskId', 'taskNameSnapshot', 'date', 'completed', 'completedAt', 'updatedAt') then
        raise exception 'Unknown completion field' using errcode = '22023'; end if;
    end loop;
  else raise exception 'Invalid entity type' using errcode = '22023'; end if;
  if p_data ? 'updatedAt' then perform (p_data->>'updatedAt')::timestamptz; end if;
  if p_data ? 'completedAt' then
    if jsonb_typeof(p_data->'completedAt') <> 'string' then raise exception 'Invalid completion timestamp' using errcode = '22023'; end if;
    perform (p_data->>'completedAt')::timestamptz;
  end if;
end;
$$;
revoke all on function dailycheck_private.validate_entity(text, text, jsonb) from public, anon, authenticated;

create function public.cloud_apply(p_operation_id uuid, p_kind text, p_id text, p_payload jsonb,
  p_expected_revision bigint, p_deleted boolean default false, p_device_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_oauth boolean := nullif(auth.jwt()->>'client_id', '') is not null;
  v_current public.cloud_entities; v_request jsonb; v_receipt public.cloud_operations;
  v_revision bigint; v_result jsonb; v_now timestamptz := now();
begin
  if not coalesce(dailycheck_private.can_access(v_oauth), false) then
    raise exception 'Cloud permission denied' using errcode = '42501'; end if;
  if not v_oauth then perform dailycheck_private.desktop_guard(p_device_hash); end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 or p_deleted is null
    or p_kind not in ('task', 'completion') or p_id is null or length(p_id) not between 1 and 160 then
    raise exception 'Invalid operation' using errcode = '22023'; end if;
  if v_oauth and (p_kind <> 'task' or p_deleted or p_expected_revision <> 0) then
    raise exception 'Integration only has create permission' using errcode = '42501'; end if;
  -- The account row serializes changes AND checkpoint allocation, avoiding commit-order cursor gaps.
  perform 1 from public.cloud_accounts where owner = v_owner for update;
  if not dailycheck_private.can_access(v_oauth) then raise exception 'Cloud permission denied' using errcode = '42501'; end if;
  v_request := jsonb_build_object('kind', p_kind, 'id', p_id, 'payload', p_payload, 'expected', p_expected_revision, 'deleted', p_deleted);
  select * into v_receipt from public.cloud_operations where owner = v_owner and operation_id = p_operation_id;
  if found then
    if v_receipt.request <> v_request then raise exception 'Idempotency key reused with different data' using errcode = '22023'; end if;
    return v_receipt.result;
  end if;
  if (select count(*) from public.cloud_operations where owner = v_owner and created_at > now() - interval '1 minute') >= 400 then
    raise exception 'Cloud write limit reached; retry later' using errcode = '53300'; end if;
  select * into v_current from public.cloud_entities where owner = v_owner and kind = p_kind and id = p_id;
  if p_kind = 'completion' and not exists(select 1 from public.cloud_entities where owner = v_owner
    and kind = 'task' and id = p_payload->>'taskId' and not deleted) then
    return jsonb_build_object('status', 'conflict', 'current', null);
  end if;
  if coalesce(v_current.revision, 0) <> p_expected_revision or coalesce(v_current.deleted, false) then
    return jsonb_build_object('status', 'conflict', 'current', case when v_current.owner is not null then to_jsonb(v_current) - 'owner' else null end);
  end if;
  if not p_deleted then perform dailycheck_private.validate_entity(p_kind, p_id, p_payload);
  elsif p_kind <> 'task' or v_current.owner is null then raise exception 'Invalid deletion' using errcode = '22023'; end if;
  update public.cloud_accounts set revision = revision + 1 where owner = v_owner returning revision into v_revision;
  insert into public.cloud_entities(owner, kind, id, payload, revision, deleted, updated_at, origin)
    values (v_owner, p_kind, p_id, case when p_deleted then v_current.payload else p_payload end, v_revision, p_deleted, v_now, case when v_oauth then 'mcp' else 'desktop' end)
    on conflict (owner, kind, id) do update set payload = excluded.payload, revision = excluded.revision,
      deleted = excluded.deleted, updated_at = excluded.updated_at, origin = excluded.origin;
  insert into public.cloud_changes select owner, revision, kind, id, payload, deleted, updated_at, origin from public.cloud_entities where owner = v_owner and kind = p_kind and id = p_id;
  -- Task deletion tombstones completions in the same serialized transaction.
  if p_deleted then
    for v_current in select * from public.cloud_entities where owner = v_owner and kind = 'completion' and payload->>'taskId' = p_id and not deleted loop
      update public.cloud_accounts set revision = revision + 1 where owner = v_owner returning revision into v_revision;
      update public.cloud_entities set revision = v_revision, deleted = true, updated_at = v_now where owner = v_owner and kind = 'completion' and id = v_current.id;
      insert into public.cloud_changes select owner, revision, kind, id, payload, deleted, updated_at, origin from public.cloud_entities where owner = v_owner and kind = 'completion' and id = v_current.id;
    end loop;
  end if;
  v_result := jsonb_build_object('status', 'applied', 'entity', (select to_jsonb(e) - 'owner' from public.cloud_entities e where owner = v_owner and kind = p_kind and id = p_id));
  insert into public.cloud_operations(owner, operation_id, request, result) values (v_owner, p_operation_id, v_request, v_result);
  return v_result;
end;
$$;

create function public.cloud_pull(p_after bigint default 0, p_limit integer default 100, p_snapshot bigint default null, p_device_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_snapshot bigint; v_rows jsonb; v_next bigint; v_more boolean;
begin
  perform dailycheck_private.desktop_guard(p_device_hash);
  if not dailycheck_private.can_access(false) then raise exception 'Cloud disabled' using errcode = '42501'; end if;
  select revision into v_snapshot from public.cloud_accounts where owner = auth.uid();
  v_snapshot := coalesce(p_snapshot, v_snapshot);
  if p_after is null or p_after < 0 or p_limit is null or p_limit not between 1 and 200 or v_snapshot < p_after
    or v_snapshot > (select revision from public.cloud_accounts where owner = auth.uid()) then raise exception 'Invalid sync cursor' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) - 'owner' order by c.revision), '[]'::jsonb), max(c.revision) into v_rows, v_next
    from (select * from public.cloud_changes where owner = auth.uid() and revision > p_after and revision <= v_snapshot order by revision limit p_limit) c;
  v_next := coalesce(v_next, v_snapshot);
  v_more := exists(select 1 from public.cloud_changes where owner = auth.uid() and revision > v_next and revision <= v_snapshot);
  return jsonb_build_object('changes', v_rows, 'next', v_next, 'snapshot', v_snapshot, 'hasMore', v_more);
end;
$$;

create function public.cloud_list(p_kind text, p_limit integer default 100, p_after text default '', p_snapshot bigint default null,
  p_from_date text default null, p_until_date text default null, p_task_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_snapshot bigint; v_rows jsonb; v_last text; v_more boolean;
begin
  if not dailycheck_private.can_access(false) then raise exception 'Cloud permission denied' using errcode = '42501'; end if;
  select revision into v_snapshot from public.cloud_accounts where owner = auth.uid();
  v_snapshot := coalesce(p_snapshot, v_snapshot);
  if p_kind is null or p_kind not in ('task', 'completion') or p_limit is null or p_limit not between 1 and 100
    or p_after is null or length(p_after) > 160 or v_snapshot < 0 or v_snapshot > (select revision from public.cloud_accounts where owner = auth.uid())
    or (p_from_date is not null and not dailycheck_private.valid_date(p_from_date))
    or (p_until_date is not null and not dailycheck_private.valid_date(p_until_date)) then raise exception 'Invalid list query' using errcode = '22023'; end if;
  with snapshot as (
    select distinct on (id) * from public.cloud_changes where owner = auth.uid() and kind = p_kind and revision <= v_snapshot order by id, revision desc
  ), page as (
    select * from snapshot where not deleted and id > p_after
      and (p_from_date is null or payload->>'date' >= p_from_date)
      and (p_until_date is null or payload->>'date' <= p_until_date)
      and (p_task_id is null or payload->>'taskId' = p_task_id or (p_kind = 'task' and id = p_task_id))
      order by id limit p_limit + 1
  ) select coalesce(jsonb_agg(to_jsonb(p) - 'owner' - 'n' order by p.id) filter(where p.n <= p_limit), '[]'::jsonb),
    max(p.id) filter(where p.n <= p_limit), count(*) > p_limit into v_rows, v_last, v_more
    from (select page.*, row_number() over(order by id) n from page) p;
  return jsonb_build_object('items', v_rows, 'snapshot', v_snapshot, 'nextCursor', case when v_more then v_last end);
end;
$$;

revoke all on function public.cloud_configure(boolean, text, text), public.cloud_set_grant(uuid, boolean, boolean),
  public.cloud_apply(uuid, text, text, jsonb, bigint, boolean, text), public.cloud_pull(bigint, integer, bigint, text),
  public.cloud_list(text, integer, text, bigint, text, text, text) from public, anon;
grant execute on function public.cloud_configure(boolean, text, text), public.cloud_set_grant(uuid, boolean, boolean),
  public.cloud_apply(uuid, text, text, jsonb, bigint, boolean, text), public.cloud_pull(bigint, integer, bigint, text),
  public.cloud_list(text, integer, text, bigint, text, text, text) to authenticated;
