# Peer

Peer is a 42 teammate-matching prototype. The React/Vite client lives in `clients/`; the NestJS API lives in `api/`. 42 sign-in and private onboarding are connected. Real discovery is still pending; fictional profiles are available only through an explicit development-only demo.

## Run

Use Node.js 22.13+ (or Node.js 24 LTS) and npm.

```sh
npm install
cp .env.example .env
npm run prisma:generate --workspace api
npm run prisma:migrate:deploy:env --workspace api
npm run dev:api
```

In a second terminal, run `npm run dev` to start Vite. Set `FORTYTWO_ELIGIBLE_CURSUS_IDS` to verified cursus IDs in `.env` before attempting sign-in. The client proxies `/api` and `/socket.io` to `localhost:3000` in local development.

## Docker development

Docker Compose can start the Nest API (`http://localhost:3000`) and Vite client (`http://localhost:5173`). The client proxies `/api` and `/socket.io` to the API. SQLite is stored at `/data/peer.db`; `./volumes` is mounted there and excluded from version control apart from its `.gitkeep`.

```sh
docker compose up --build
```

The API health endpoint is `GET http://localhost:3000/api/health`. Compose generates the Prisma client and applies checked-in SQLite migrations at startup. SQLite lives at `/data/peer.db`, mounted from `./volumes`.

## 42 provider adapter status

The API has a server-only 42 OAuth flow with single-use browser-bound attempts and S256 PKCE, local account upsert, and seven-day opaque-cookie sessions. The short-lived PKCE verifier is derived per attempt and is never persisted. `GET /api/auth/42` starts login; the callback creates a hidden, not-yet-onboarded account and session. `GET /api/auth/session` returns the current session and CSRF token; `POST /api/auth/logout` and `/api/auth/logout-all` require that token and an exact `APP_ORIGIN` Origin header. `POST /api/me/onboarding` saves a bio and makes the account visible only after explicit opt-in. Signed-in users can create, list, pause and renew up to three intentions via `GET/POST /api/me/intents` and `PATCH /api/me/intents/:id`; each confirmation lasts 14 days. General discussion can omit a project, while team intentions require one. Project names are currently self-reported; `GET /api/projects` lists names already used in intentions. Discovery and introductions are still pending, and no fictional peers are shown in authenticated accounts. Auth starts are limited to 10/minute/IP and callbacks to 30/minute/IP. API security headers are applied centrally. `TRUST_PROXY_HOPS` defaults to `0`; configure only the exact trusted proxy hop count when deploying behind a proxy. Candidate provider endpoints, scope, and response fields remain unverified against a registered 42 application. Configure `FORTYTWO_CLIENT_ID`, `FORTYTWO_CLIENT_SECRET`, and `FORTYTWO_REDIRECT_URI` only in the API environment; never put credentials in `clients/`. Use the exact callback URL registered with 42. Tests use controlled provider responses and do not claim a live integration.

Login fails closed unless `FORTYTWO_ELIGIBLE_CURSUS_IDS` is a comma-separated allowlist of verified student cursus IDs. The exact IDs and provider eligibility semantics remain a launch prerequisite; membership alone does not claim active enrollment.

For local development, use Node 22.13+ and run `npm install`, `npm test`, and `npm run build`. The API integration test uses a separate temporary SQLite database and provider stubs. For local Compose, copy `.env.example` to `.env`, then enter **rotated** credentials locally. `.env` is git-ignored; never commit or share it. Register the callback URL exactly as configured with the 42 application.

```sh
npm run build
npm test
```

The client production output is `clients/dist/`.

## Try it

- Merge Aya in the default deck to see a mutual match. Yassine's preset incoming like is false, so liking him stays pending.
- Drag right/left, press the arrow keys, or use Merge / Rebase later.
- Undo the last swipe, including a match. A match requires both a merge decision and a fixture incoming like.
- Change project, campus and hours. Guidance shows peers with a validated project; Team rescue shows in-progress projects and app-owned teamless intent. Schedule match uses the hours selector.
- Open Matches to add/remove positive endorsements and write local demo messages. Messages are never delivered.
- Turn visibility off in My profile to leave the discovery pool. Reset demo data there.
- Swipes, endorsements, messages and opt-in persist in localStorage under `peer-demo-v1`.

## Current demo boundary

`clients/src/data.js` separates illustrative API-shaped identity (`login`, `displayname`, `campus`, `cursus_users`, `projects_users`, `validated?`) from `app` metadata. No actual API response is included. All people and stats are invented, and no real student's image is used.

The prototype's profiles and interactions remain fictional. Do not use them as production data or put provider credentials in the client. The implementation baseline and required security/product behavior are documented in `PEER_REQUIREMENTS.md`.

## Scope and safety

This is a single-browser prototype, not a multi-user app. Frontend visibility and private swipes are demo behavior, not security boundaries. React escapes rendered text; no raw HTML or credentials are stored. Only local fictional progress is persisted. Illustrations are inline SVG and decorative fonts have local fallbacks.
