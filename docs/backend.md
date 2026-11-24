# StudyLens backend (P15)

The backend is the Next.js app in `web/`, deployed on Vercel (Hobby), with a Turso (libSQL)
database. It exists for **study groups** (P16, P18, P18b). **The extension does not call it yet** —
that starts in P16, and only after the user joins or creates a group and grants the optional
permission to contact the server.

Status: deployed (P15d, 2026-11-23).

- Production URL: **https://studylens-flame.vercel.app** — health check:
  https://studylens-flame.vercel.app/api/health (returns `"ok":true` and `"db":"up"`).
- Vercel project root directory `web`; function region **`pdx1`** (Portland, Oregon), saved in
  `web/vercel.json` (`"regions": ["pdx1"]`), which overrides the dashboard setting.
- Turso database in **`aws-us-west-2`** (Oregon), next to the function region.

## What is stored — and what never is

| Stored                                                       | Never stored                                     |
| ------------------------------------------------------------ | ------------------------------------------------ |
| A random device ID and a display name the user picks         | Emails, real names, accounts, passwords          |
| A **SHA-256 hash** of each device's token                    | The token itself                                 |
| Groups (name, join code), who is in which group              | Browsing data: sites, hostnames, URLs, titles    |
| Daily **focus minutes** per device (P18)                     | Site categories, distraction data, research data |
| Live group session: optional goal, length, times, status     | IP addresses (not stored, not logged by the app) |
| Error messages, scrubbed of URLs/domains/emails/IPs, 14 days | Request bodies, headers, user agents             |
| Rate-limit counters keyed by device ID (deleted after a day) | Anything in error logs that links to a device    |

A unit test (`web/lib/db/sql-db.test.ts`) fails if any column name looks like it could hold URLs,
hostnames, domains, IPs, emails, titles or paths. Request schemas are **strict**: unknown fields are
rejected, so the extension can't accidentally send extra data.

Vercel itself keeps short-lived request logs (including IPs) as part of its platform; the app
does not read or store them. See PRIVACY.md (draft groups section).

## Schema

Defined as numbered migrations in `web/lib/db/schema.ts`; applied by `runMigrations`
(`web/lib/db/migrate.ts`) when the server first opens the database. Migrations are idempotent and
each runs in a transaction. Never edit a shipped migration — add a new version. Times are epoch
milliseconds.

| Table                  | Columns                                                                                                                                | For     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `devices`              | `id`, `display_name` (1–30), `token_hash` (unique, 64 hex), `created_at`, `last_seen_at`                                               | P15/P16 |
| `groups`               | `id`, `name` (1–40), `join_code` (unique), `created_by` → devices, `created_at`                                                        | P16     |
| `memberships`          | `group_id`, `device_id`, `role` (`owner`/`member`), `joined_at`                                                                        | P16     |
| `group_sessions`       | `id`, `group_id`, `host_device_id`, `goal` (optional, ≤120), `planned_minutes` (1–240), `started_at`, `ended_at`                       | P18b    |
| `session_participants` | `session_id`, `device_id`, `status` (`focusing`/`finished`/`left`), `joined_at`, `last_heartbeat_at`, `focus_minutes` (only if shared) | P18b    |
| `device_presence`      | `device_id`, `since`, `expires_at` — "who's in a session right now" in passive groups                                                  | P18     |
| `daily_totals`         | `device_id`, `local_date` (`YYYY-MM-DD`), `focus_minutes` (0–1440), `updated_at`                                                       | P18     |
| `error_logs`           | `id`, `source` (`server`/`extension`), `route`, `message` (≤500), `extension_version`, `created_at`                                    | P15     |
| `rate_limits`          | `key`, `window_start`, `count`                                                                                                         | P15     |
| `schema_migrations`    | `version`, `name`, `applied_at`                                                                                                        | —       |

Deleting a device cascades to its memberships, participation, presence and daily totals; groups
and sessions it created keep existing with `created_by` / `host_device_id` set to NULL.

## Data layer

All server data access goes through the `Db` interface (`web/lib/db/types.ts`). Implementations:

- **libSQL** (`sql-db.ts`), written against a tiny SQL executor (`executor.ts`) with two drivers:
  - `@libsql/client` — Turso in production (remote URL, web client, no native code), and local
    `file:` databases where libSQL's native driver loads (Linux CI; Windows needs the Microsoft
    Visual C++ Redistributable).
  - `node:sqlite` (built into Node 24) — automatic fallback for local `file:` databases when the
    libSQL native driver can't load. Same SQLite dialect, same schema and queries.
- **In-memory stub** (`memory.ts`) — used when `TURSO_DATABASE_URL` is empty (outside
  production). Data is lost on restart.

`getDb()` (`web/lib/db/index.ts`) picks one from the environment. In production an empty
`TURSO_DATABASE_URL` is an error (health reports `db: "down"`).

## API

All routes: JSON in and out, `Cache-Control: no-store`, CORS (below), and the `apiRoute` wrapper
(`web/lib/api/handler.ts`), which includes **`withErrorLogging`**: expected errors become JSON
errors; unexpected ones are stored in `error_logs` (scrubbed message only) and answered with a
generic 500.

### Error shape

```json
{
  "ok": false,
  "error": {
    "code": "validation_failed",
    "message": "…",
    "details": [{ "path": "displayName", "message": "…" }]
  }
}
```

| Status | `code`                                           |
| ------ | ------------------------------------------------ |
| 400    | `invalid_json`, `validation_failed`              |
| 401    | `unauthorized` (with `WWW-Authenticate: Bearer`) |
| 403    | `origin_not_allowed`                             |
| 413    | `payload_too_large` (bodies are max 4 KB)        |
| 415    | `unsupported_media_type` (send JSON)             |
| 429    | `rate_limited` (with `Retry-After` seconds)      |
| 500    | `internal_error`                                 |
| 503    | `not_configured` (cleanup without `CRON_SECRET`) |

### Endpoints

| Method + path       | Auth                   | Body                                         | Success                                         |
| ------------------- | ---------------------- | -------------------------------------------- | ----------------------------------------------- |
| `GET /api/health`   | none                   | —                                            | `200 { ok, db: "up", version }` (503 if down)   |
| `POST /api/devices` | none                   | `{ displayName }` (1–30 chars, not an email) | `201 { deviceId, token, displayName }`          |
| `POST /api/errors`  | device token           | `{ message, context?, extensionVersion? }`   | `202 { ok: true }`                              |
| `GET /api/cleanup`  | `Bearer <CRON_SECRET>` | —                                            | `200 { ok, errorLogsDeleted, goalsCleared, … }` |

Types for these are in `packages/shared/src/api.ts`. Group endpoints come in P16/P18/P18b.

### Auth (no accounts)

1. `POST /api/devices` creates a random device ID (UUID) and a random 256-bit token
   (`slt_` + 43 base64url characters). The token is returned **once**; the database keeps only its
   SHA-256 hash. (A fast hash is fine for random 256-bit tokens; they can't be brute-forced like
   passwords.)
2. Later requests send `Authorization: Bearer <token>`. The server hashes it and looks it up.
   Missing, malformed or unknown tokens get 401.
3. Losing the token = registering again as a new device. (Revocation/rotation can come with P16.)

### Rate limits

Counted in the `rate_limits` table (fixed windows), so they work across serverless instances.
Keys are device IDs — never IPs.

- `POST /api/devices`: 100 registrations per hour **in total** (there is no device yet, and we
  don't store IPs). Trade-off: a flood could block new registrations for up to an hour.
- `POST /api/errors`: 20 per device per hour.

### Error reports

`POST /api/errors` accepts only `message` (≤500), `context` (`background`, `popup`, `options`,
`interstitial`, `welcome`, `other`) and `extensionVersion` (`x.y.z`). The message is scrubbed
before storing: web addresses → `[url]`, emails → `[email]`, IPs → `[ip]`, anything that looks like
a domain → `[domain]` (this also catches code like `browser.tabs` — privacy over debuggability).
The device ID is **not** stored with the error.

### CORS

Allowed origins:

- `chrome-extension://phepgpemnllainhhjemgknaeedjjekad` (the Edge Add-ons build)
- `moz-extension://<uuid>` — Firefox gives each install a random UUID, so any well-formed
  Firefox extension origin is allowed (it can't be pinned to our add-on ID)
- outside production only: `http://localhost:<port>`, `http://127.0.0.1:<port>`, and any
  `chrome-extension://<32 letters>` (unpacked dev builds have their own ID)

Other origins get 403 (preflight and real requests). Requests with no `Origin` (curl, Vercel Cron)
pass without CORS headers. CORS is not authentication — the bearer token is.

### Cleanup (Vercel Cron)

`web/vercel.json` runs `GET /api/cleanup` daily at 09:00 UTC. Vercel sends
`Authorization: Bearer <CRON_SECRET>` automatically when the `CRON_SECRET` env var is set. It:

- deletes `error_logs` older than **14 days**
- clears group session goals **24 h after the session ended** (or after its planned end, if the
  host never ended it)
- deletes `device_presence` rows past `expires_at`, and `session_participants` rows with no
  heartbeat for 24 h
- deletes rate-limit counters older than a day

## Environment variables

See `web/.env.example`. Set them in the Vercel dashboard; for local dev, in `web/.env.local`
(gitignored). Never commit real values.

| Name                 | Production             | Local dev                                         |
| -------------------- | ---------------------- | ------------------------------------------------- |
| `TURSO_DATABASE_URL` | `libsql://…turso.io`   | `file:.data/dev.db` (on M:), or empty = in-memory |
| `TURSO_AUTH_TOKEN`   | Turso token            | not needed for `file:`                            |
| `CRON_SECRET`        | random, 32+ characters | anything, to try `/api/cleanup`                   |

## Run locally (PowerShell, from the repo root)

1. `Copy-Item web\.env.example web\.env.local`
2. Open `web\.env.local` and set `TURSO_DATABASE_URL=file:.data/dev.db` and any `CRON_SECRET`.
   The database file is created in `web\.data\` (on M:, gitignored).
3. `npm run dev -w web`
4. In a second PowerShell window:
   - `Invoke-RestMethod http://localhost:3000/api/health`
   - `Invoke-RestMethod http://localhost:3000/api/devices -Method Post -ContentType 'application/json' -Body '{"displayName":"Test"}'`
5. Tests: `npm test` (API and database tests create temporary database files in `web\.data\test\`
   and delete them afterwards).

On this Windows PC the libSQL native driver needs the Microsoft Visual C++ Redistributable. Without
it, local files automatically use Node's built-in SQLite (a one-line warning is printed). CI on
Linux always uses the real libSQL driver (`REQUIRE_LIBSQL=1`).

## Deploying (P15d — done by hs in the web dashboards)

Never paste the token or secret into a chat, an issue, or a file in the repo.

### (a) Turso database + auth token

1. Go to https://app.turso.tech and sign up / log in (GitHub login is easiest).
2. Click **Databases** → **Create Database**. Name: `studylens`. Pick the location closest to
   your Vercel function region. (StudyLens uses Turso `aws-us-west-2` with the Vercel function
   region set to `pdx1` Portland in Project → Settings → Functions.) Create.
3. Open the database. Copy its **URL** (looks like `libsql://studylens-<you>.turso.io`). This is
   `TURSO_DATABASE_URL`. Keep it in a private note (e.g. Notepad, not saved in the repo).
4. On the same page click **Create Token** (sometimes under the **⋯** menu or "Generate Token").
   Expiration: **Never** (or a long period — you'd have to update Vercel when it expires).
   Access: **Read & Write**. Copy the token — it's shown only once. This is `TURSO_AUTH_TOKEN`.
   The app creates its own tables on first use (migrations run automatically).

### (b) Import the repo into Vercel

1. Go to https://vercel.com and log in with GitHub (Hobby plan).
2. **Add New…** → **Project**. Find `studylens` under "Import Git Repository" (if it's missing,
   click **Adjust GitHub App Permissions** and give Vercel access to it) → **Import**.
3. **Root Directory**: click **Edit**, choose `web`, confirm. Framework Preset should say
   **Next.js**. Leave the build/install commands on their defaults.
   (Vercel runs the install from inside `web/`, which makes npm install only `web/`'s own
   dependencies — not the root `package.json`'s. So `web/package.json` must list everything
   `next build` needs, including `typescript` and `vitest` (the build type-checks test files).
   If you add a build-time tool to the root, add it to `web/` too, at the same version.)
4. Before clicking Deploy, open **Environment Variables** and add the three in step (c).
5. Click **Deploy**. When it finishes, open `https://<your-project>.vercel.app/api/health` —
   it should show `"ok":true` and `"db":"up"`.

### (c) Environment variables

1. Generate a CRON_SECRET in PowerShell (copies a random 64-character hex string to the
   clipboard without printing it):

   ```powershell
   $b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) | Set-Clipboard
   ```

2. In Vercel add (Key → Value), for all environments (Production, Preview, Development):
   - `TURSO_DATABASE_URL` → the URL from (a) step 3
   - `TURSO_AUTH_TOKEN` → the token from (a) step 4
   - `CRON_SECRET` → paste from the clipboard (Ctrl+V)
3. Already deployed before adding them? Project → **Settings** → **Environment Variables**, add
   them there, then **Deployments** → the latest one → **⋯** → **Redeploy** (env changes only
   apply to new deployments).
4. Check the cron: Project → **Settings** → **Cron Jobs** should list `/api/cleanup` (daily).
