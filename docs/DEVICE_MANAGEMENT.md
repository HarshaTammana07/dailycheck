# Device Management

DailyCheck allows each account to authorize at most two active desktop installations.

## Device Identity

On first launch, the Electron main process creates a random installation ID. It stores that ID using OS-protected storage where available, then exposes only a SHA-256 hash to the renderer. The app does not use MAC addresses, hardware fingerprints, IP addresses, or other invasive identifiers.

## Server Enforcement

The two-device limit is enforced by `public.register_device_atomic` in `supabase/migrations/0001_device_registry.sql`.

Apply `0002_restrict_device_rpc_permissions.sql` too: these privileged functions are
executable only by the server's `service_role`. Without this migration, Postgres's
default PUBLIC EXECUTE grant would let clients call them with a supplied user ID.
Edge Functions validate a signed-in user's token and verified email before deriving
that user's ID server-side.

The function:

- Takes a per-user advisory transaction lock.
- Checks recent authorization attempts for rate limiting.
- Reuses an existing active registration for the same device hash.
- Rejects a third active device.
- Inserts a new device only while the lock is held.

Because the limit is enforced inside the database transaction, simultaneous login attempts cannot bypass the limit by racing the client.

## Revocation

The `revoke-device` Edge Function marks `revoked_at`. A revoked device loses authorization during the next online validation. If it is fully offline, it may continue until its offline lease expires.

## Offline Lease

The default offline authorization lease is 24 hours after the last successful online validation. Set `VITE_OFFLINE_AUTH_LEASE_HOURS` for the desktop app and `OFFLINE_AUTH_LEASE_HOURS` for Edge Functions.

## Security Limits

A normal desktop app cannot be made impossible to modify or clone. This project implements reasonable protection for a learning app: server-side authorization, short offline leases, rate limiting, and no client-side trust for the device count.
