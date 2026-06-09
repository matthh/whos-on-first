# Who's On First — Claude Instructions

**Read `docs/ARCHITECTURE.md` first.** It's the living overview of how this app works — data ownership, auth flow, endpoint reference, key modules, deprecated paths, and known tech debt. Keep it updated (and bump its "Last reviewed" date) whenever you change query routing, endpoints, schema, or data sources.

## Fast facts

- **Stack:** Next.js 15 App Router, React 19, Tailwind v4, Drizzle ORM + Neon Postgres, Vercel deploy.
- **Auth:** Google OAuth → custom HMAC session cookie (`wof-session`). Middleware injects `x-user-id` header. New users start as `pending` and must be approved by an admin.
- **Scheduling runs client-side.** `lib/scheduler.ts` is a browser-side backtracking solver. API routes only persist results.
- **Spotify** uses a service-account model — the app owner links once (`/api/auth/spotify-service-connect`), and all coaches share that account for playlist operations. Per-coach OAuth columns still exist in the schema but are legacy.
- **Admin email** is configurable via `ADMIN_NOTIFICATION_EMAIL` env var (falls back to `matthh@gmail.com`).
- **Dev port:** `next dev` uses the default port 3000 (no `-p` flag in the `dev` script).

## Required env vars

`POSTGRES_DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_BASE_URL` (prod only), `RESEND_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `ANTHROPIC_API_KEY`.

Optional: `ADMIN_NOTIFICATION_EMAIL`, `FROM_EMAIL`, `GOOGLE_LOGIN_REDIRECT_URI`, `SPOTIFY_REDIRECT_URI`.

## Schema & migrations

Schema in `src/lib/schema.ts`. Migrations in `drizzle/`. Run migrations with `npx drizzle-kit migrate`.

## Key invariants

- Every API route that touches user data must call `getUserId(request)` (set by middleware from the session cookie) and verify the user owns the resource.
- Admin routes call `isAdmin(request)`.
- Never select `spotifyAccessToken` / `spotifyRefreshToken` in admin-facing queries.
- Roster `PUT` is the single write path for both players and team config (constraint settings, team name, logo).
