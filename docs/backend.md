# StudyLens backend (P15, P16, P18, P18b)

The backend is the Next.js app in `web/`, deployed on Vercel (Hobby), with a Turso (libSQL)
database. It exists for **study groups** (P16, P18, P18b). The extension calls it **only** after the
user clicks "Join or create a group" on the Study groups tab and grants the optional permission to
contact the server (`extension/src/groups/`); solo users never contact it.

Status: deployed (P15d, 2026-11-23). Study group endpoints added in P16; passive groups (focus
minutes, "focusing now") in P18; live group focus sessions in P18b (2026-11-25, for v0.6.0); the web
companion (landing page, `/privacy`, live room pages `/s/<code>`) in P18c.

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
| (goal + whole session deleted 24 h after it ended, P18b)     | Check-ins, conditions, labels (never sent)       |
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

| Table                  | Columns                                                                                                                                          | For     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `devices`              | `id`, `display_name` (1–30), `token_hash` (unique, 64 hex), `created_at`, `last_seen_at`                                                         | P15/P16 |
| `groups`               | `id`, `name` (1–40), `join_code` (unique), `created_by` → devices, `created_at`                                                                  | P16     |
| `memberships`          | `group_id`, `device_id`, `role` (`owner`/`member`), `joined_at`, `share_minutes`, `share_presence` (0/1, P18: my switches per group)             | P16/P18 |
| `group_sessions`       | `id`, `group_id`, `host_device_id`, `goal` (optional, ≤120), `planned_minutes` (1–240), `started_at`, `ended_at`, `ends_at` (m. 3)               | P18b    |
| `session_participants` | `session_id`, `device_id`, `status` (`focusing`/`finished`/`left`), `joined_at`, `last_heartbeat_at`, `focus_minutes` (unused), `left_at` (m. 3) | P18b    |
| `device_presence`      | `device_id`, `since`, `expires_at` — "who's in a session right now" in passive groups                                                            | P18     |
| `daily_totals`         | `device_id`, `local_date` (`YYYY-MM-DD`), `focus_minutes` (0–1440), `updated_at`                                                                 | P18     |
| `error_logs`           | `id`, `source` (`server`/`extension`), `route`, `message` (≤500), `extension_version`, `created_at`                                              | P15     |
| `rate_limits`          | `key`, `window_start`, `count`                                                                                                                   | P15     |
| `schema_migrations`    | `version`, `name`, `applied_at`                                                                                                                  | —       |

Deleting a device cascades to its memberships, participation, presence and daily totals; groups
and sessions it created keep existing with `created_by` / `host_device_id` set to NULL.

Migration 4 (`live-room-codes`, P18c) adds `group_sessions.room_code`: 16 characters from the
join-code alphabet (≈ 2.5 × 10^23 codes, `crypto.randomInt`), unique (partial unique index), for
the read-only room page. A collision (practically impossible) gets one retry when starting.

Migration 3 (`live-group-sessions`, P18b) adds `group_sessions.ends_at` — the **shared end time**
(server clock), normally `started_at + planned_minutes`, stored on its own so the local E2E test
server can run sessions of a few seconds — and `session_participants.left_at`. Minutes in a
session are computed from `joined_at` → `left_at` / `ends_at`, so the extension never sends them;
`focus_minutes` stays unused.

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
| 404    | `not_found` (unknown join code / not in group)   |
| 409    | `group_full`, `too_many_groups`                  |
| 409    | `session_running`, `session_over` (P18b)         |
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

Study groups (P16), all with the device token:

| Method + path                       | Body                       | Success                                                                                   |
| ----------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/groups`                  | `{ name }` (1–40 chars)    | `201 { group }` — I'm the owner; 409 `too_many_groups`                                    |
| `POST /api/groups/join`             | `{ code }` (any case, `-`) | `201 { group }` (joined) / `200` (already in it); 404, 409 `group_full`/`too_many_groups` |
| `GET /api/groups`                   | —                          | `200 { me: { displayName }, groups: [{ id, name, joinCode, role, joinedAt, members }] }`  |
| `DELETE /api/groups/:id/membership` | —                          | `200 { ok: true }` (leave); 404 if not a member                                           |
| `PATCH /api/devices/me`             | `{ displayName }`          | `200 { displayName }`                                                                     |
| `DELETE /api/devices/me`            | —                          | `200 { ok: true }` — device, memberships, presence, totals: all gone; token dead          |

`members` is `[{ displayName, role, isMe }]`, oldest member first — other members' device IDs are
never sent. Each group also has `sharing: { focusMinutes, focusingNow }` — my switches (P18).
`POST /api/groups` and `/join` take an optional `sharing` object; left out, both are off. Types:
`packages/shared/src/api.ts`, `groups.ts` and `activity.ts`.

Passive groups (P18), all with the device token:

| Method + path                   | Body                                                    | Success                                                                     |
| ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST /api/totals`              | `{ days: [{ localDate: "YYYY-MM-DD", focusMinutes }] }` | `200 { ok, stored }` — upsert 1–7 days; `stored: 0` if no group shares them |
| `POST /api/presence`            | `{ state: "start" \| "heartbeat" \| "stop" }`           | `200 { ok, focusing }` — focusing for 3 min after start/heartbeat           |
| `PATCH /api/groups/:id/sharing` | `{ focusMinutes?, focusingNow? }`                       | `200 { sharing }`; turning one off deletes that data (see below); 404       |
| `GET /api/groups/:id/overview`  | `?today=YYYY-MM-DD` (viewer's local date, optional)     | `200 { group, today, members }`; 404 if not a member                        |
| `GET /api/groups/focusing`      | —                                                       | `200 { count }` — other members focusing now (popup line)                   |

Overview members: `{ displayName, role, isMe, todayMinutes, focusingNow, history }`. `null` means
the member doesn't share it **in this group**; `history` is 7 `{ localDate, focusMinutes }`
entries ending on `today`, missing days as 0. `focusingNow` is true while the last
start/heartbeat is less than 3 minutes old. No device IDs, sites, categories, goals, conditions or
check-in answers exist on the server, so none can appear.

Live group focus sessions (P18b), all with the device token:

| Method + path                            | Body                 | Success                                                                                 |
| ---------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `POST /api/groups/:id/sessions`          | `{ goal?, minutes }` | `201 { serverNow, session }` — I'm the host; 409 `session_running`; 404 if not a member |
| `GET /api/group-sessions`                | —                    | `200 { serverNow, sessions }` — running sessions in my groups (≤ 1 per group)           |
| `GET /api/group-sessions/:id`            | —                    | `200 { serverNow, session }` — running or ended (summary); 404                          |
| `POST /api/group-sessions/:id/join`      | —                    | `201` joined / `200` already in it (reconnect); 409 `session_over` / `session_running`  |
| `POST /api/group-sessions/:id/leave`     | —                    | `200 { serverNow, session }` — status `left`; again or after the end: no change; 404    |
| `POST /api/group-sessions/:id/heartbeat` | —                    | `200 { serverNow, session }` — I'm still focusing; 404 if not in it                     |

`session` is `{ id, groupId, groupName, goal, plannedMinutes, startedAt, endsAt, state, me,
participants, roomCode }`; `state` is `running` / `ended`, `me` my status or null; each participant is
`{ displayName, isMe, isHost, status, recentlySeen, focusMinutes }`. Types:
`packages/shared/src/live.ts`.

**Live session rules (P18b).**

- **One running session per group, one per device.** Both are checked inside the INSERT (one
  statement, one transaction), so two members starting at once can't both succeed. "Running" =
  not ended, before `ends_at`, and at least one participant still `focusing`.
- **Shared end time.** The server's clock sets `ends_at`; every answer carries `serverNow`. The
  extension measures the offset (server − local, taking the middle of the request as "now") and
  turns `ends_at` into its own clock. The heartbeat re-measures it each minute and moves the local
  end when it is more than 2 s off.
- **Joining late** is allowed; the joiner's local session runs from joining to the same `ends_at`.
  **Joining again** while still focusing is a reconnect (200). **Leaving** is final for that
  session (`session_over` on a rejoin).
- **Host leaving:** nothing special — the session keeps running for everyone else until
  `ends_at`. When **nobody** is focusing any more (all left, left the group, or deleted their
  device), the session ends at once (`ended_at` = now), so the group can start a new one.
- **Status:** `focusing` → `finished` at `ends_at` (computed on read; the cleanup writes it down),
  or `left` with `left_at`. `recentlySeen` is false while focusing with no heartbeat for 3 minutes
  (offline or browser closed).
- **Summary minutes:** `focusMinutes` = whole minutes from joining to leaving / the end, shown only
  once the participant is done and **only if they share focus minutes in that group** (the P18
  switch); `null` = "not shared".
- **Who sees it:** members of the group only (404 for anyone else). Leaving the group removes me
  from its live sessions. No device IDs, sites, labels, conditions or check-ins exist here.
- **Goal:** optional, ≤120 characters, no email or web address. Hidden by the API 24 h after the
  end, and deleted (with the whole session and its participant rows) by the daily cleanup after
  that — so at the latest about 48 h after the end (the cron runs once a day on Hobby).
- **Test seconds:** `testSeconds` (1–600) in the start body is accepted **only** when
  `STUDYLENS_LIVE_TEST_SECONDS=1`, outside Vercel and outside production builds — set only by the
  E2E test server (`extension/e2e/web-server.ts`). Everywhere else it is an unknown field (400).

**Live room (P18c), no token:**

| Method + path          | Success                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `GET /api/rooms/:code` | `200 { serverNow, room }`; 404 (same message) for unknown, malformed, expired |

`room` is `{ groupName, goal, plannedMinutes, startedAt, endsAt, state, participants }`, each
participant `{ displayName, isHost, status, recentlySeen }`: no device IDs, no session or group
IDs, no minutes, no "me". Valid until **1 hour after the session ended** (`ended_at` if everyone
left early, else `ends_at`). Rate-limited **per client address, in memory only** (1200/hour: the
page polls every 15 s, and a class may share one address). Responses carry
`X-Robots-Tag: noindex, nofollow`.

**Why polling, not WebSockets.** Vercel Hobby functions are short-lived request handlers: they
can't hold a socket open, and Vercel's WebSocket support is in beta. Plain requests keep working
through laptop sleep, flaky school Wi-Fi and serverless restarts, need no extra service, and are
easy to rate-limit. The extension asks every 15 s **only while the popup or the Study groups tab is
open and visible**, plus one heartbeat per minute while a group session runs; a 15 s delay is fine
for "who is focusing".

**Passive group rules (P18).**

- Totals are **numbers only**: one row per device and local date (the member's own calendar). The
  server doesn't know time zones, so `today` in an overview is the viewer's date (at most one day
  from the server's UTC date). Friends in different time zones may see "today" shift by a day.
- **Impossible values are rejected (400):** not a real date, more than 1440 minutes, a date that
  hasn't started anywhere yet (local dates begin at the earliest at UTC+14), more minutes than
  have passed on that date anywhere, a date older than 7 days, duplicate dates, more than 7 days
  per request, or any extra field (strict schemas).
- **Switches per group.** Data is stored per device, but a group sees it only if that member's
  switch is on in that group. Totals/presence are only saved while at least one of the device's
  groups shares them. As soon as no group shares them any more (a switch turned off, or leaving a
  group), they are **deleted** in the same transaction, not just hidden. Memberships from before
  P18 (migration 2) start with both switches off.
- **Leaving** a group or **deleting the device** removes everything at once (as above).
- `daily_totals` are deleted by the daily cleanup once their date is more than **14 days** before
  the cleanup's UTC date. `device_presence` rows expire 3 minutes after the last heartbeat (they
  stop counting immediately; the cleanup deletes them later).

**Group rules.** Join codes are 8 characters from `23456789ABCDEFGHJKMNPQRSTWXYZ` (no look-alikes
such as 0/O or 1/I/L), made with a cryptographic random generator, case-insensitive, and shown as
`ABCD-EFGH`. A group has at most **20** members; a device is in at most **5** groups (including
the ones it created). Both limits are checked inside the same INSERT that adds the membership, so
simultaneous joins can't go past them. When the owner leaves, the longest-standing member becomes
the owner; when the last member leaves, the group (and any live sessions) is deleted. Deleting a
device does both for each of its groups. These deletes are written out explicitly, so they work
even if the remote database doesn't enforce foreign keys.

### Auth (no accounts)

1. `POST /api/devices` creates a random device ID (UUID) and a random 256-bit token
   (`slt_` + 43 base64url characters). The token is returned **once**; the database keeps only its
   SHA-256 hash. (A fast hash is fine for random 256-bit tokens; they can't be brute-forced like
   passwords.)
2. Later requests send `Authorization: Bearer <token>`. The server hashes it and looks it up.
   Missing, malformed or unknown tokens get 401.
3. Losing the token = registering again as a new device. (Revocation/rotation can come with P16.)

### Rate limits

Two kinds, both fixed one-hour windows:

- **Per device**, counted in the `rate_limits` table, so they hold across serverless instances.
  Keys are device IDs — never IPs.
- **Per client address**, counted **in memory only** (`web/lib/api/client-limit.ts`). The address
  comes from Vercel's `x-forwarded-for` (Vercel overwrites it, so clients can't fake it) and is
  replaced by an HMAC with a random key made when the instance starts, so even memory holds no raw
  address. Never written to the database, logs or error reports. Each serverless instance has its
  own counters, which reset on restart: a best-effort brake on scripts, not an exact quota.
  Expired counters are dropped at least every 10 minutes, so an address is forgotten within about
  70 minutes. Limits
  are generous because a whole class on school Wi-Fi shares one public address. Locally there is no
  proxy header, so every request counts as one client (`local`).

| Endpoint                      | Per device (database) | Per client address (memory) |
| ----------------------------- | --------------------- | --------------------------- |
| `POST /api/devices`           | — (no device yet)     | 30 / hour                   |
| `POST /api/groups/join`       | 20 attempts / hour    | 60 attempts / hour          |
| `POST /api/groups`            | 10 / hour             | 30 / hour                   |
| `PATCH /api/devices/me`       | 20 / hour             | —                           |
| `POST /api/errors`            | 20 / hour             | —                           |
| `POST /api/totals`            | 60 / hour             | —                           |
| `POST /api/presence`          | 150 / hour            | —                           |
| `PATCH …/sharing`             | 60 / hour             | —                           |
| `GET …/overview`              | 600 / hour            | —                           |
| `GET /api/groups/focusing`    | 240 / hour            | —                           |
| `POST …/sessions` (start)     | 20 / hour             | —                           |
| `POST …/join`                 | 60 / hour             | —                           |
| `POST …/leave`                | 60 / hour             | —                           |
| `POST …/heartbeat`            | 150 / hour            | —                           |
| `GET /api/group-sessions`     | 600 / hour            | —                           |
| `GET /api/group-sessions/:id` | 900 / hour            | —                           |
| `GET /api/rooms/:code`        | — (no device)         | 1200 / hour                 |

Every join attempt counts — wrong codes too — before the code is looked at, so guessing one of
~6.6 × 10^11 codes is hopeless. `POST /api/devices` also has a **global backstop** of 1000
registrations per hour in the database. (This replaces P15's single global limit of 100 per hour,
which one script could use up for everyone.)

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
- live group sessions (P18b): marks sessions past `ends_at` as ended (participants still in →
  `finished`, `groupSessionsEnded`); clears goals **24 h after the session ended** (`ended_at`, else
  `ends_at`) and deletes those sessions with their participant rows (`groupSessionsDeleted`)
- deletes `device_presence` rows past `expires_at`, and `session_participants` rows with no
  heartbeat for 24 h
- deletes rate-limit counters older than a day
- deletes `daily_totals` whose local date is more than **14 days** before the cleanup's UTC date
  (P18; returned as `dailyTotalsDeleted`)

## Web companion pages (P18c)

The same Next.js app serves the public pages. Colors are the extension's Sunrise tokens
(`packages/shared/src/themes.ts`, WCAG AA checked in `web/lib/site/site.test.tsx`). No cookies,
analytics, third-party scripts or fonts.

| Path            | What                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/`             | landing page (static): what StudyLens is, 4 store screenshots, install buttons, privacy promise, links                 |
| `/privacy`      | `PRIVACY.md` from the repo, rendered at build time with `marked` (relative links → GitHub)                             |
| `/media/<name>` | allowlisted repo images (store screenshots, icon), prerendered at build time                                           |
| `/s/<code>`     | live room (client page polling `/api/rooms/:code` every 15 s while visible); `noindex`, `Referrer-Policy: no-referrer` |
| `/robots.txt`   | allows `/`, disallows `/s/` and `/api/`                                                                                |

The build reads files outside `web/` (`PRIVACY.md`, `docs/store/screenshots/`, `extension/public/icon/`),
which works because Vercel builds from the whole repository (the same reason `packages/shared`
resolves). Every response also gets `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy` and a minimal `Permissions-Policy` (`web/next.config.ts`).

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

**E2E tests** (`npm run test:e2e`) start their own copy of this app with `next dev` on
`http://127.0.0.1:3101` (the E2E extension build's server), using `web/.next-e2e/` as its build
folder and a fresh database file in `web/.data/e2e/` (old ones are deleted at the next run). See
`extension/e2e/web-server.ts`. It doesn't clash with a `npm run dev -w web` you have running.

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
