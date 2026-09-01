# Who's On First — Architecture

**Last reviewed: 2026-09-01**

## Purpose

Who's On First is a single-user-per-coach web app that generates defensive position assignments for youth baseball / softball games. A coach manages a roster of 10–13 players, marks absent players before each game, and clicks Generate to produce a per-inning lineup that satisfies a configurable constraint set (positional restrictions, fairness rules, outfield rotations, etc.). The sheet is exportable as a PDF. An optional Spotify integration auto-builds a walk-on-music playlist in batting order.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router (TypeScript) |
| UI | React 19, Tailwind v4, @dnd-kit (drag-and-drop) |
| Database | Neon Postgres (serverless driver) via Drizzle ORM |
| Auth | Custom HMAC session token + Google OAuth |
| AI | Anthropic Claude (Haiku 4.5) for practice station generation |
| PDF | jsPDF + jspdf-autotable, QRCode |
| Email | Resend |
| Deploy | Vercel |

---

## Data ownership

All data lives in Neon Postgres. There is no external blob store.

| Table | Owns |
|---|---|
| `users` | Coach accounts: Google auth identity, Spotify per-coach OAuth tokens (legacy path), role, status |
| `teams` | One user → many teams. Stores constraint config JSON, logo data URL, cached Spotify playlist id, walk-on playlist URL |
| `rosters` | `players` JSON array keyed by `(userId, teamId)` — player names, ranks, absent flags, walk-on songs, avoid-positions |
| `game_history` | Snapshot of players + ranks per game date, keyed by `(userId, teamId)` |
| `app_settings` | App-owner Spotify service account tokens (key-value store, single row per setting) |
| `constraint_overrides` | Per-team per-constraint boolean overrides (currently unused in routing — config is stored in `teams.constraintConfig`) |

**Note:** `users.teamName`, `users.logoDataUrl`, `users.constraintConfig` are legacy columns — all new writes go to `teams`. Old rows read gracefully.

---

## Authentication & Sessions

1. `/api/auth/google-login` → redirects to Google OAuth with HMAC-signed state + nonce cookie.
2. `/api/auth/google-login-callback` → verifies state (HMAC + nonce + expiry), fetches Google profile, finds-or-creates user, sets HMAC session cookie (`wof-session`).
3. Middleware (`src/middleware.ts`) validates the session cookie on every request (except `PUBLIC_PATHS`). On success it sets `x-user-id` request header; all API routes read auth identity from this header via `getUserId()` / `getUser()` in `lib/auth.ts`.
4. Clients can never inject `x-user-id` — middleware strips it before forwarding.
5. New users are created with `status: "pending"`. An admin must approve them before the app is usable (pending users see a gate screen).
6. Session expiry: 30 days. No server-side revocation store — logout just clears the cookie.

**Admin action links** (`/api/admin/users/action?token=…`) are HMAC-signed and publicly accessible so admins can approve/reject from email without being logged in. Tokens expire after 7 days.

---

## Data flow — game sheet generation

All scheduling logic runs **client-side** in the browser:

```
page.tsx (handleGenerate)
  → generateGameSheet(players, config)         [lib/scheduler.ts]
      → buildBench(...)                         picks bench assignments
      → computeOFBlocked(...)                   marks OF-ineligible innings
      → solveAll(inn)                           recursive backtracker per inning
          → solveInning(...)                    generator yielding assignments
  → applyAvoidPositionsPostPass(sheet, ...)    soft prefer-position swaps
  → validateGameSheet(sheet, ...)              returns violation strings
  → POST /api/history                          persists snapshot to DB
  → POST /api/spotify/sync-playlist            fire-and-forget playlist sync
```

The solver uses hardcoded bench schedules for the standard 6-inning / 10-field-size case and a dynamic generator for non-standard configurations. A 10-second wall-clock budget prevents browser hangs on infeasible constraints.

**Playoff mode** (`config.playoffMode`) selects alternate bench schedules (`BENCH_6INN_PLAYOFF`) for 11- and 12-player rosters that: (1) keep all top-6 ranked players off the bench in the final inning, and (2) stagger top-6 sits so no two adjacent ranks sit together. 13-player teams already satisfy both rules with the default schedule.

---

## Key modules

| File | Role |
|---|---|
| `src/lib/scheduler.ts` | Core solver: bench scheduling, backtracking position assignment, constraint enforcement, validation, avoid-position post-pass |
| `src/lib/constraints.ts` | Constraint/config types, defaults, localStorage persistence (config), `migrateRestrictions()` |
| `src/lib/types.ts` | Shared types: `Player`, `WalkOnSong`, `GameSheet`, position constants |
| `src/lib/schema.ts` | Drizzle schema — all tables |
| `src/lib/db.ts` | Drizzle client, reads `POSTGRES_DATABASE_URL` |
| `src/lib/auth.ts` | `getUserId`, `getUser`, `getActiveTeam`, `signOAuthState`, `verifyOAuthState` |
| `src/lib/session.ts` | `createSessionToken`, `validateSessionToken` — HMAC session tokens |
| `src/lib/spotify.ts` | Spotify OAuth helpers, token refresh, playlist/track helpers, service account management. Detects Spotify's 6-month `invalid_grant` expiry, auto-clears stored tokens, and surfaces a re-link prompt. |
| `src/lib/email.ts` | Resend-based transactional emails (signup, approval, invite). Admin email hardcoded to `matthh@gmail.com` |
| `src/lib/pdf.ts` | Game-sheet PDF (`generatePDF`) |
| `src/lib/walk-up-pdf.ts` | Walk-on music printout PDF (`generateWalkUpPDF`) |
| `src/lib/practice-pdf.ts` | Practice plan PDF (`generatePracticePDF`) |
| `src/lib/colors.ts` | Logo color extraction (canvas pixel sampling) for PDF theming |
| `src/lib/storage.ts` | Legacy localStorage roster helpers — still imported for `addHistoryEntry` / `clearAbsences` logic |
| `src/middleware.ts` | Edge middleware: session validation, `x-user-id` injection/stripping |
| `src/app/page.tsx` | Main app shell — loads roster/config from API, orchestrates all UI state |
| `src/app/settings/page.tsx` | Team management, constraint config, Spotify connect |
| `src/app/admin/page.tsx` | User management, Spotify service account linking |

---

## API endpoint reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/google-login` | Public | Initiate Google OAuth |
| GET | `/api/auth/google-login-callback` | Public | Google OAuth callback |
| POST | `/api/auth/logout` | Public | Clear session cookie |
| GET | `/api/auth/status` | Session | Current user + teams summary |
| GET | `/api/auth/spotify-connect` | Session | Initiate per-coach Spotify OAuth (legacy — see note) |
| GET | `/api/auth/spotify-callback` | Public* | Per-coach Spotify OAuth callback (legacy) |
| GET | `/api/auth/spotify-service-connect` | Admin | Initiate service-account Spotify OAuth |
| GET | `/api/auth/spotify-service-callback` | Session (admin check inside) | Service Spotify callback |
| GET | `/api/auth/spotify-status` | Session | Check Spotify config + service link status |
| POST | `/api/auth/spotify-disconnect` | Session | Clear per-coach Spotify tokens |

*`/api/auth/spotify-callback` is in `PUBLIC_PATHS` even though the callback verifies a signed state that embeds the userId — it must be public because the browser redirect from Spotify won't carry the session cookie.

### Data

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/roster` | Session (approved) | Load players + team config for active team |
| PUT | `/api/roster` | Session (approved) | Save players + config; lazily creates first team on onboarding |
| GET | `/api/teams` | Session (approved) | List teams + activeTeamId |
| POST | `/api/teams` | Session (approved) | Create team |
| POST | `/api/teams/[id]` | Session (approved, owns team) | Switch active team |
| PATCH | `/api/teams/[id]` | Session (approved, owns team) | Rename team / update playlist URL |
| DELETE | `/api/teams/[id]` | Session (approved, owns team) | Delete team (not last) |
| GET | `/api/history` | Session (approved) | Game history for active team |
| POST | `/api/history` | Session (approved) | Save history entry |
| DELETE | `/api/history?id=N` | Session (approved) | Delete history entry |

### Spotify

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/spotify/search?q=…` | Session | Search Spotify tracks via service account |
| POST | `/api/spotify/sync-playlist` | Session | Create/update team walk-on playlist |

### AI

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/practice/generate-station` | Session | Generate practice station via Claude Haiku |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/users` | Admin session | List all users |
| POST | `/api/admin/users` | Admin session | Create / invite user |
| PATCH | `/api/admin/users` | Admin session | Update user (role, status, name, email) |
| DELETE | `/api/admin/users?id=N` | Admin session | Delete user |
| GET | `/api/admin/users/action?token=…` | Public (signed token) | Approve/reject user from email link |

---

## Deprecated paths

- `lib/storage.ts` — `loadRoster` / `saveRoster` (localStorage) are no longer called from production code. `addHistoryEntry` and `clearAbsences` are still used as pure logic helpers in `page.tsx` but do not touch localStorage. Can be refactored to remove the localStorage code paths.
- `lib/constraints.ts` — `loadConstraints()` / `saveConstraints()` are marked `@deprecated` — replaced by `loadConfig()` / `saveConfig()`. These still touch localStorage and are not called from production code.
- `users.teamName`, `users.logoDataUrl`, `users.constraintConfig` — legacy schema columns, kept for row-read compatibility. New writes go to `teams`.
- Per-coach Spotify OAuth (`/api/auth/spotify-connect`, `/api/auth/spotify-callback`) — superseded by the service-account flow. The `users` table still has `spotifyAccessToken` / `spotifyRefreshToken` columns from this era. These columns are written to by the callback but the sync route no longer reads them (uses service account instead).
- `constraint_overrides` table — present in schema, migrated, but not read by any route or UI component.

---

## Tech debt

1. **`logoDataUrl` has no size limit** in the roster `PUT` route — a large base64 image can be stored without bounds (the Onboarding UI caps file upload at 2 MB, but direct API callers bypass this).
2. **`constraint_overrides` table** exists in schema and migrations but is completely unused. Dead code at the DB layer.
3. **`storage.ts` is stale** — `loadRoster` / `saveRoster` check `typeof window` for SSR safety but the module is still imported in lib context. Recommend pruning or converting to pure utility functions.
4. **No rate limiting** on `/api/spotify/sync-playlist` or `/api/practice/generate-station` — both make expensive third-party calls (Spotify API, Anthropic) without any throttling.
5. **No Content-Security-Policy header** — `next.config.ts` sets `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`, but no CSP.
6. **No test suite** — the scheduler (`lib/scheduler.ts`) and constraint logic (`lib/constraints.ts`) are pure functions with complex behaviour but have no unit tests.
7. **AI model ID may go stale** — `claude-haiku-4-5-20251001` is hardcoded in `src/app/api/practice/generate-station/route.ts`. There is no `check:models` script in this project; if the model is retired, the endpoint will return 502 errors silently. Review model ID periodically.
8. ~~**`/api/admin/users` GET is unbounded**~~ — **Fixed 2026-09-01**: `.limit(500)` added.
9. ~~**`teams/[id]/route.ts` DELETE fetches all team rows for count check**~~ — **Fixed 2026-09-01**: replaced `.length` check with `COUNT(*)::int`.
10. ~~**`/api/auth/spotify-status` exposes `serviceUserId`**~~ — **Fixed 2026-09-01**: removed from response.
11. **Remaining CVEs in devDependencies** — `esbuild` (via `drizzle-kit`) and bundled `postcss` (inside `next`) have moderate-severity advisories. Fixing the next/postcss pairing requires upgrading to Next.js 16 (a breaking change). Esbuild is a dev-only tool with no production exposure. Track for resolution on the next major-version upgrade cycle.

*Items resolved in 2026-09-01 audit: L-7 (admin GET unbounded — `.limit(500)` added), L-8 (spotify-status leaked serviceUserId — removed from response), L-9 (teams DELETE count-check — replaced `.length` with `COUNT(*)::int`), L-10 (middleware HMAC comparison — replaced manual XOR loop with `crypto.subtle.verify`), L-new (admin PATCH/POST name field unsanitized — HTML stripping + 100-char cap applied matching roster PUT). Also applied `npm audit fix`: Next.js 15.5.15 → 15.5.25, postcss, nanoid, js-yaml, brace-expansion bumped.*

*Items resolved in 2026-08-25 audit: H-1 (admin PATCH Spotify token leak — column projection added to `.returning()`), L-5 (coachName validation — HTML stripping and 100-char cap applied).*

*Items resolved in 2026-08-04 audit: M-1 (practice generate-station approval gate), M-5 (role/status enum validation in admin routes), M-6 (Spotify routes skip approval gate — search, sync-playlist, disconnect), L-1 (practice-pdf loadPennant duplication — now imports from pdf.ts), L-5 (history GET unbounded — .limit(200) added), L-6 (db.ts non-null assertion replaced with explicit error).*

*Items resolved in previous audits: H1 (admin Spotify token leak), H2 (history POST validation), H3 (XSS in admin action page), M-prior (scheduler console.log), M-prior (page.tsx UUID), M-prior (Onboarding.tsx UUID), M3 (admin PATCH email validation), L1 (admin email env var), L3 (drizzle-kit devDependencies).*

---

## Gotchas

- **Session cookie vs. OAuth state**: the Spotify per-coach callback is in `PUBLIC_PATHS` (required for redirect flows), but the state token embeds the userId — so the callback can still associate tokens without relying on the session cookie being present.
- **Edge runtime in middleware**: `validateToken` reimplements the HMAC check using `crypto.subtle` (Web Crypto) because `crypto.timingSafeEqual` from Node.js is unavailable in the Vercel Edge runtime. The two implementations must stay in sync.
- **`getActiveTeam` has a side effect**: if a user has teams but no `activeTeamId`, it picks the oldest team and writes `activeTeamId` back to the DB. Callers should be aware this is not a pure read.
- **Solver runs client-side**: the backtracking scheduler runs in the browser, not on the server. This keeps the API surface simple but means mobile browsers may time out on edge-case constraint configurations.
- **Admin email env var**: `lib/email.ts` reads `ADMIN_NOTIFICATION_EMAIL`, falling back to `matthh@gmail.com`. The env var is optional but recommended to avoid leaking a personal address in source.
- **Spotify sync mutates the roster**: `/api/spotify/sync-playlist` may write default walk-on songs back to the roster if players are missing song assignments. This is a side effect callers should be aware of — it is fire-and-forget from the Generate handler.
