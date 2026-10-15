# Cloud sync and ChatGPT integration

Introduced in version 1.1.0. The hosted endpoint and consent page have been deployed and tested with a real OAuth connection. The installed preview retained existing data, synchronized tasks, and received a task created while the desktop was closed. Use the acceptance checks below when deploying another project or changing this integration.

## Behavior and data

Users explicitly enable cloud sync in Settings before existing tasks, notes, and completion history are uploaded to their existing Supabase account. Local IndexedDB remains the working copy. Theme and calendar selection remain local preferences. Authentication tokens, device secrets, and local account identifiers are not copied into cloud task payloads.

While online, the desktop synchronizes at startup, approximately every 20 seconds, and after focus/network recovery. Failed requests retry with backoff up to five minutes. Offline edits persist in an account-scoped transactional outbox. A closed computer cannot upload its latest offline edits; ChatGPT sees committed cloud records and receives that freshness explanation in tool results. The MCP service is hosted in Supabase Edge Functions and starts on requests; the desktop does not need to run a server process.

All changes use durable operation IDs, expected record revisions, and a serialized per-account change stream. A retry cannot create a duplicate task. Conflicting edits remain local and visible until the user chooses the cloud version or retries reviewed local edits. Deletion tombstones prevent stale edits from resurrecting records. Task deletion also tombstones its completions. Snapshot pagination does not combine different revisions of a checklist.

Pausing cloud access disables it for the account, including connected integrations, once the server receives the request. An offline pause displays that server access is still pending. Pausing retains uploaded records and pending local edits; it does not erase cloud data. Other computers may subsequently resume this account's sync. Integration grants can be revoked while paused.

## Tools and permissions

The MCP endpoint is `https://xjblgkuwrpgvgwkkamus.supabase.co/functions/v1/dailycheck-mcp`.

| Tool | Behavior |
| --- | --- |
| `get_profile` | Linked account, timezone, today's date, cloud revision |
| `list_tasks` | Paginated tasks, notes, recurrence and metadata; optional archived tasks |
| `get_task` | Exact task plus optional paginated completion history in a date interval |
| `get_day_checklist` | Scheduled checklist and completion state for an explicit date |
| `get_month_summary` | Full-month occurrence totals using the desktop's recurrence rules; future dates are included and remaining occurrences are not called overdue |
| `create_task` | Creates a daily/weekday task with an explicit start date and durable idempotency key |

Discovery is public; tool data requires a verified Supabase OAuth token and a matching account grant. The consent page defaults to read-only access. Creating tasks requires an explicit permission selection or a later change in DailyCheck Settings. Supabase currently supports identity scopes rather than custom task scopes, so the database enforces application permissions independently. OAuth tokens cannot manage devices, grant themselves access, or use desktop synchronization RPCs. MCP does not use a service-role key.

The first version intentionally has no integration tools for editing/deleting tasks, marking completions, or setting timed reminders. Task notes are returned as untrusted user data, never executable instructions. Disconnecting blocks the application grant first, then revokes the OAuth grant. If OAuth revocation fails, application access is still blocked and the UI explains the remaining token-revocation failure.

## Deployment order

1. Apply `supabase/migrations/0003_cloud_sync.sql` once after the existing 0001 and 0002 migrations. This is additive and does not upload local data. It also restricts device-table reads to ordinary user sessions.
2. Deploy `dailycheck-mcp` and redeploy all four device functions from this branch. All five use `verify_jwt = false`; their code validates authentication. The legacy gateway JWT switch is incompatible with the newer OAuth discovery flow. Do not turn off application checks.
3. Stage the consent page using the feature branch's Download Website workflow. The workflow uses the existing public Supabase Actions variables, compiles the consent UI, and derives installer links from the actual stable GitHub release. It does not publish a desktop release.
4. Verify `https://harshatammana07.github.io/dailycheck/authorize/` loads. Without an authorization ID it should ask users to start from ChatGPT.
5. In Supabase Authentication → OAuth Server, enable the server. Configure Site URL `https://harshatammana07.github.io` and Authorization Path `/dailycheck/authorize/`. Preserve the existing explicit `dailycheck://auth/callback` and password-reset redirect entries. Verify the Dashboard constructs the expected consent URL. Do not change signing keys without inspecting the project's current configuration.
6. Enable dynamic client registration if the ChatGPT connection requires it, or register the exact client/callback presented by ChatGPT. Client registration alone grants no task access; each user must consent. Never guess the ChatGPT callback URL or share project secret keys.
7. Install/test the preview desktop, enable sync, and wait until its pending queue is empty. Add the MCP URL in ChatGPT's custom-server UI with OAuth. Sign in to the same verified DailyCheck account and choose permissions.

CLI deployment, after a user-owned Supabase login/link:

```powershell
supabase db push --linked
supabase functions deploy dailycheck-mcp --no-verify-jwt
supabase functions deploy register-device --no-verify-jwt
supabase functions deploy list-devices --no-verify-jwt
supabase functions deploy revoke-device --no-verify-jwt
supabase functions deploy validate-device --no-verify-jwt
```

For Dashboard deployment, run `node scripts/prepare-cloud-dashboard.mjs <destination>`. It produces a self-contained MCP source file, four updated device sources, and the SQL migration. Deploy each under its exact function name. Keep existing function secrets; the platform injects project credentials. No new private credential is needed in the website.

For Pages staging, run `gh workflow run pages.yml --repo HarshaTammana07/dailycheck --ref feat/cloud-mcp` from the already authenticated PowerShell. A later main-branch Pages deployment can replace this preview page until the feature is merged; avoid unrelated main releases during the connection test.

## Acceptance before stable publication

Automated checks:

```text
npm run typecheck
npm test
npm run test:edge
npm run test:release
npm run test:cloud
npm run test:mcp
npm run build:consent
npm run build
npm run website:check
```

The database suite executes the actual migration in PostgreSQL through PGlite with authenticated/anonymous roles. The MCP suite sends real JSON-RPC requests through the SDK HTTP handler; authorization and database transports are mocked there. These are not substitutes for a real OAuth-provider test.

Live checks still required:

- Anonymous initialize/tools-list succeeds; private tool calls produce an OAuth challenge.
- Supabase OAuth discovery, client registration, authorization code with PKCE, refresh and expiry work with ChatGPT.
- Read-only connection reads this account's tasks but cannot create; explicit create permission permits creation.
- Create one task with the desktop closed, retry with the same key, then reopen and confirm exactly one task appears.
- Create/toggle tasks offline, reopen online, and verify queue acknowledgement and matching history.
- Two computers editing the same task produce an explicit conflict; unrelated edits still synchronize.
- Switch accounts while a request is active; records and outboxes stay isolated.
- Pause and disconnect deny subsequent integration calls. A revoked desktop cannot configure, push, or pull.
- Existing 1.0.2 tasks and history survive the preview installation and new schema.
- An eventual stable update completes through Download Update → Restart and Install, with retained tasks.

## Operational limits

Writes are limited to 400 new operations per minute per account. Reads are paginated (100 rows per tool page). Aggregate tools reject oversized results above 1,000 tasks or 5,000 completion records instead of silently returning incorrect totals. Use paginated tools for larger accounts. Hosting outages, expired sessions, and quota errors keep local pending changes for later retries.

The change log, tombstones, and idempotency receipts are retained indefinitely. Measure usage and define archival/retention with a full-resync and retry policy before removing history; deleting receipts or history arbitrarily would break these guarantees. OAuth Server is a Supabase beta capability, so live discovery/client compatibility remains a deployment checkpoint.

The IndexedDB upgrade is additive (schema 2 → 3) and preserves existing records. Older desktop builds using schema 2 cannot open an already-upgraded schema 3 database. Export JSON if you need a rollback copy; do not uninstall and delete app data to resolve an update. The release workflow accepts stable versions only. Bump the version and changelog, merge the reviewed branch, then dispatch the existing Windows release workflow. Pages derives installer links from the published release. Supabase migrations and Edge Functions are deployed separately; pushing code alone does not publish a desktop release or apply backend migrations.

## References

- [OpenAI custom MCP servers](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth)
- [Supabase hosted MCP](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [Supabase OAuth Server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security)
