-- Run after 0001_device_registry.sql. Safe to run again; no rows are deleted.
-- Postgres grants EXECUTE to PUBLIC on new functions by default. These
-- SECURITY DEFINER functions accept a user ID and must be server-only.
begin;

revoke execute on function public.active_devices_json(uuid)
  from public, anon, authenticated;
revoke execute on function public.register_device_atomic(uuid, text, text, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.active_devices_json(uuid) to service_role;
grant execute on function public.register_device_atomic(uuid, text, text, text, text, integer)
  to service_role;

commit;
