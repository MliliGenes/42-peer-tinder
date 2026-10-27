# Peer — React prototype

A small 42 teammate-matching demo with eight fictional profiles. No backend, real users, credentials, live API calls or paid services.

## Run

Use Node.js 22.12+ (or Node.js 24 LTS).

```sh
npm install
npm run dev
```

```sh
npm run build
```

The production output is static `dist/`.

## Try it

- Merge Aya in the default deck to see a mutual match. Yassine's preset incoming like is false, so liking him stays pending.
- Drag right/left, press the arrow keys, or use Merge / Rebase later.
- Undo the last swipe, including a match. A match requires both a merge decision and a fixture incoming like.
- Change project, campus and hours. Guidance shows peers with a validated project; Team rescue shows in-progress projects and app-owned teamless intent. Schedule match uses the hours selector.
- Open Matches to add/remove positive endorsements and write local demo messages. Messages are never delivered.
- Turn visibility off in My profile to leave the discovery pool. Reset demo data there.
- Swipes, endorsements, messages and opt-in persist in localStorage under `peer-demo-v1`.

## API boundary

`src/data.js` separates illustrative API-shaped identity (`login`, `displayname`, `campus`, `cursus_users`, `projects_users`, `validated?`) from `app` metadata. No actual API response is included. All people and stats are invented, and no real student's image is used.

Reference: https://api.intra.42.fr/apidoc

- `/v2/users/:id` is the intended profile integration. The full schema must be verified in authenticated documentation before connecting it.
- `/v2/users/:user_id/locations` is documented with `begin_at`, `end_at`, and campus metadata. Campus time can be derived from session intervals; this demo supplies fixed totals.
- Likes, match decisions, endorsements, opt-in, teamless intent, schedules, circles and chat are app-owned or derived data, not assumed 42 endpoints or fields.
- Detailed documentation pages redirected to sign-in during research; this prototype does not claim a fully verified live adapter.

For live integration, add a server-side OAuth flow and token handling, paginated data access, explicit user consent, rate-limit handling and server-enforced authorization. Never add an API client secret to the React bundle. Real team availability cannot be inferred solely from a project being in progress.

## Scope and safety

This is a single-browser prototype, not a multi-user app. Frontend visibility and private swipes are demo behavior, not security boundaries. React escapes rendered text; no raw HTML or credentials are stored. Only local fictional progress is persisted. Illustrations are inline SVG and decorative fonts have local fallbacks.
