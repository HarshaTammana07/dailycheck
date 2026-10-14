# Backend Testing

The database function `register_device_atomic` should be tested in a Supabase project before a public release.

## Scenarios

- First device registers successfully.
- Same device revalidates without consuming another slot.
- Second device registers successfully.
- Third device is denied.
- Revoking one device allows another device to register.
- Thirty-plus rapid attempts are rate limited.
- Two concurrent third-device attempts do not bypass the limit.

## Practical Concurrency Test

Use two parallel HTTP requests to `register-device` with different `deviceIdHash` values after two devices already exist. Both should not become active. The advisory transaction lock is the protection being tested.
