# Peer — requirements and implementation guide

Version 1.0 · Consolidated implementation baseline · 6 November 2026

Repository: https://github.com/MliliGenes/42-peer-tinder

Reviewed baseline: `main`, commit `a7d7084fce21a756564c6f43f2ceebc8cf27f331`. Recheck current repository instructions, code and lockfile before implementation.

## 1. Goal and authority

Build the existing prototype into an inexpensive, real application for 42 students to find teammates or people to talk to. A user signs in with 42, declares an intention, discovers compatible opted-in peers, sends a short introduction, and starts chatting after the recipient accepts.

This guide is for the coding agent. **Confirmed** means the owner explicitly chose it. **Default** means a concrete recommended implementation choice, not a claim of explicit owner approval. Implement confirmed behavior using the documented defaults unless the owner changes them; choose routine details without repeatedly interviewing the owner. Report material deviations and unavailable verification. This guide defines the application to implement. Production deployment, subscription purchases and changes to live data require the owner's separate authorization; local implementation and verification can proceed.

### Confirmed product decisions

| Area | Requirement |
| --- | --- |
| Sign-in | Official 42 OAuth application program; 42 is the primary identity/eligibility source |
| Audience | Students across the entire 42 network, not only 1337 or one campus |
| Purposes | Join a team, recruit a teammate, general chat, and project-specific discussion |
| Compatibility | Two people both looking to join a team may connect and form one themselves |
| Teams | Connect individuals; users arrange teams themselves. No managed rosters or group chat |
| First contact | Short introduction request; recipient accepts before full chat opens |
| Native chat | Near-instant online delivery and persisted messages |
| Conversation identity | One continuing in-app DM per pair, with project/purpose context attached |
| Discord | Support OAuth linking and manual handles, with distinct verification labels |
| Contact disclosure | Only after introduction acceptance and only for channels the contact owner enables |
| Contact email | Send an ownership-verification link before allowing sharing |
| Account deletion | Keep history for the other participant with deleted-user attribution |
| Stack preference | NestJS, Prisma, SQLite, Vite and React; small backend |
| Design | Preserve current visual direction; redesign can come later |
| Hosting | Railway; exact operating ceiling is not decided |

The earlier above-100-DH budget answer is context, not a fixed cap. Do not substitute 150/250/500 DH or authorize spending. The budget remains an operating decision before paid deployment, not a reason to stop implementation.

### Defaults to make the guide actionable

| Area | Default |
| --- | --- |
| Runtime | One Nest process serving React assets, HTTP API and a Socket.IO gateway |
| Auth | Opaque local sessions in HttpOnly cookies, seven-day absolute expiry |
| Provider tokens | Fetch required profile/Discord identity, then discard tokens; no background token store |
| Eligibility | Verified 42 student identity with a supported student cursus; exact provider fields must be verified before live launch. Alumni/piscine-only/staff eligibility is not confirmed |
| Intentions | Up to three active intentions/user; expiry 14 days after explicit confirmation |
| Schedule | Morning / Evening / Any time plus IANA timezone; language tags |
| Introduction | Plain text, 1–500 trimmed characters; expires after seven days |
| Contact limits | Five new introductions/day and ten pending outbound requests/user; tune after real use |
| Messages | Plain text, 1–2,000 trimmed characters; no attachments or editing |
| History pages | 30 messages by default, maximum 100; stable ID cursors |
| Closed chats | Read-only archive; no automatic reopening or rematching |
| Deletion processing | Hide/revoke immediately; scrub identifying records within 24 hours using durable jobs |
| Moderation | Block/report plus authenticated operator CLI; review unresolved reports manually |
| Report evidence | Minimal access-restricted evidence; proposed deletion 30 days after resolution, configurable and disclosed before public launch |
| Backups | Railway daily backups, currently retained six days; test restoration and document additional manual/off-platform copies |
| Language | Preserve English UI; use local language tags for discovery, not automatic translation |

These defaults are not all product commitments. Particularly review precise eligibility, report retention, production limits and the measured hosting bill before public launch. Do not add advanced features to avoid deciding a small detail.

## 2. Existing app and scope

Current files include `src/main.jsx` (most UI/state), `src/data.js` (eight fictional people and helpers), `src/data.test.js`, and `src/style.css`. Existing scripts are `dev`, `build` and `test`, with an npm lockfile. The prototype uses `peer-demo-v1` localStorage and simulated likes/messages/endorsements.

Keep the brand, Git-themed wording, card layout, custom CSS, responsive navigation and overall colors/type direction. Split components and add screens as needed; replacing the design system is not required.

Replace simulated matching with an introduction composer, Requests inbox/outbox, accepted connections and real chat. Positive swipe/keyboard actions open the composer, not an automatic send. Private Rebase/skip remains possible. Do not silently clear real records through “Explore all peers.”

Production must not show fictional people, incoming-like fixtures, invented endorsement counts, campus hours, circles or skills as real data. Keep fixtures only in explicit development/demo mode. Never migrate fictional localStorage into real accounts.

Required v1 flows: 42 login, onboarding/visibility, local profile, intentions, discovery, introductions, accepted DMs, contact linking/sharing, email verification, block/report, account deletion, deployment documentation and tests.

Deferred: team management, groups, attachments/voice, typing indicators, public online status, seen receipts, email/push message notifications, endorsements, mentorship-specific matching, feed, ranking/compatibility scores and chat synchronization with Discord/email.

## 3. Architecture and repository layout

- Use simple npm workspaces: `apps/web` for the existing Vite/React app and `apps/api` for Nest. Keep one lockfile; no extra monorepo framework required.
- Build React to static assets and serve them from Nest in production. Do not run the Vite dev server in production.
- Same origin: `/` for frontend, `/api/*` for HTTP, `/socket.io/*` for transport; proposed Socket.IO namespace `/realtime`. Exclude API/socket paths from SPA fallbacks. API 404s must remain JSON.
- Development Vite proxies both API and socket paths, including WebSocket upgrades, to Nest.
- Prisma accesses one local SQLite file on a mounted persistent volume, not image output or ephemeral storage. Enable foreign keys, WAL and a supported bounded busy timeout; verify the actual settings and bundled SQLite version.
- Use short transactions and indexed, bounded queries. WAL still permits only one writer at a time.
- One replica/region initially. No Redis, broker, independent database container, upload service, Kubernetes or chat microservice. All-network eligibility does not imply all students are simultaneously online.
- One HTTPS mail API adapter sends verification mail. It is an outbound integration, not another backend service.
- Select/pin compatible supported Node, Nest, Prisma CLI/Client/adapter, Vite and Socket.IO versions at implementation time. Follow documentation for the selected Prisma major; do not mix old datasource/client configuration with new adapter APIs.
- Consider PostgreSQL only when measured write contention, multiple replicas or platform constraints require it. A migration requires data conversion/testing, not merely changing the provider string.

## 4. Official 42 OAuth and local sessions

### Provider verification prerequisite

Use the official 42 developer application registration. The owner configures credentials privately and registers exact development/production callback URLs. Never ask for secrets in chat or put them in frontend variables.

The official API documentation redirected to sign-in during planning. These are candidates to verify against authenticated documentation and a registered application, not a claim of live integration testing:

| Purpose | Candidate URL |
| --- | --- |
| Authorization | `https://api.intra.42.fr/oauth/authorize` |
| Code exchange | `https://api.intra.42.fr/oauth/token` |
| Authenticated identity | `https://api.intra.42.fr/v2/me` |

Verify parameters, scopes, PKCE support, immutable identity field, campus/current-campus semantics, cursus eligibility, project fields, pagination and rate-limit behavior. Request minimal scopes. Do not assume OIDC/ID tokens or confuse Intra's own login mechanism with its developer OAuth program. Missing live access does not justify fake success; use controlled provider stubs for tests and label live verification pending.

### Login requirements

1. Backend creates unpredictable state and a browser-binding nonce, stores hashes in an OAuthAttempt with five-minute expiry, and sets a temporary HttpOnly cookie. Allowlist the post-login path.
2. Redirect to 42 with exact registered callback/state. Add PKCE S256 if supported; retain any verifier securely and record the support check.
3. Callback checks provider/purpose, initiating browser, expiry and state, then atomically consumes the attempt once. Reject replay, mismatch, missing state and provider denial.
4. Exchange the code and fetch identity server-side with strict timeouts. Upsert User by immutable fortyTwoId, not email or mutable login. Concurrent login cannot duplicate accounts.
5. Check eligibility/suspension, sync only allowlisted provider fields, establish a fresh local session, clear temporary cookies and redirect without credentials in the destination URL.
6. First login stays hidden until onboarding and explicit opt-in. Failed login must not create a discoverable half-account.

### Session and HTTP protection

Use a random high-entropy opaque token, storing only its hash in Session. Default expiry: seven days absolute. Use maintained libraries/standard cryptographic primitives; no custom token algorithm or app JWT refresh system is needed.

Production cookie is host-only, HttpOnly, Secure, SameSite=Lax, Path=/; use a `__Host-` name when its requirements are met. No provider/local bearer token in localStorage.

Every protected request checks session expiry and current account state. Unsafe HTTP methods require session-bound CSRF protection and Origin validation. Ordinary business GETs are read-only; OAuth callbacks have separate state protection. Logout/logout-all/suspension/deletion revoke the relevant sessions and disconnect their sockets. Sockets disconnect at absolute session expiry.

Discard 42 tokens after the allowed profile fetch. Native chat works independently of later 42 outages. Refresh provider data by deliberate reauthentication; ongoing sync and encrypted refresh-token storage are deferred.

## 5. Profiles, intentions and discovery

Separate provider-derived identity/progress from local preferences. Provider sync cannot overwrite bio, contact sharing or intentions. Do not retain raw provider payloads or automatically expose account emails.

Profile: 42 identity/avatar, verified campus/cursus fields where available, local bio (default max 500), up to five language tags, up to eight declared skill tags (30 characters each), and visibility. Label skills/availability as self-reported. Handle missing avatars and multiple campus memberships accurately; do not silently use the first campus.

Intentions:

| Purpose | Project required? | Compatible targets |
| --- | --- | --- |
| JOIN_TEAM | Yes | Same-project RECRUIT_TEAM or JOIN_TEAM |
| RECRUIT_TEAM | Yes | Same-project JOIN_TEAM |
| DISCUSS, project scope | Yes | Same-project DISCUSS |
| DISCUSS, general scope | No | General DISCUSS |

Cross-purpose compatibility beyond this table is a default restriction, not a confirmed rejection of future use cases. DISCUSS does not imply expert mentoring; completed projects are not required merely to discuss them.

Store an explicit server-derived scopeKey: `general` or `project:<internalId>`. General scope is valid only for DISCUSS. Unique user/scope/purpose avoids SQLite nullable-uniqueness problems. Project/purpose are immutable on an intention; select/create another intention to change context. Default: three active intentions total, expiring after 14 days unless explicitly renewed. Opening the site does not renew availability.

“Team full / stop looking” deactivates the selected joining/recruiting intention; “Pause discussion” deactivates a discussion intention. These do not stop existing DMs or change other intentions. Visibility off removes discovery/new request/acceptance access, while existing conversations remain usable.

Discovery is authenticated and locally queried. Include only eligible, visible, unsuspended peers with active, unexpired compatible intentions. Exclude self, either-direction blocks, private skips and already requested contexts. Campus/language/schedule are filters, not hardcoded 1337 signup restrictions. Use deterministic keyset pagination, default 20/max 50; never call 42 per card or invent scores. Provide factual context, empty/loading/error states and no fake pool fillers.

Private skips persist per directional intention pair. Undo removes only the latest skip, not a request or accepted chat. Existing active pair DMs should show Open chat rather than a new introduction; closed pair DMs cannot be bypassed through another intention.

## 6. Introductions and one DM per pair

- Sender selects an owned intention and compatible target intention, then submits 1–500 trimmed plain-text characters. Sender identity always comes from the session.
- Store a PENDING ContactRequest with immutable context, intro, expiry and idempotency key. Intro is private to its two parties and authorized report handling; it is not a chat message anyone may append to.
- Recipient sees Accept / Decline / Block / Report. Sender sees Pending and may Cancel. Only the recipient can accept/decline; only the requester can cancel.
- Acceptance checks request state/expiry, ownership, current account/visibility/intent eligibility and blocks in one short transaction. It marks ACCEPTED and creates/reuses the canonical user-pair Conversation. Persist before HTTP success and realtime events.
- Exactly one DM per live canonical pair, with accepted request contexts attached. Context records preserve the initial project/purpose while later topics can be discussed in that same DM; do not force a project on the conversation itself.
- Default: one request per canonical intention pair, including terminal requests. Same-key retries with the same content return the existing result; changed content conflicts. Opposite-direction requests return the existing incoming request, never auto-accept it.
- Default expiry: seven days. Decline/cancel/expiry create no conversation and never silently reopen. Retrying a declined context is deferred until an explicit cooldown policy exists. Show non-accepted terminal states to sender as “Not connected,” without read receipts or block reasons.
- Once a pair has an active DM, use it rather than repeated intro requests. Closing a DM permanently stops sending in v1 and archives history. Unblocking or a new project cannot automatically reopen it.
- Default anti-spam: five new introductions/day/user, ten outbound pending at once, plus bounded IP throttling. Do not reuse a request limit as authorization.

Accepting means “agree to talk,” never formal team membership. Persist independent incoming-request badges; pending introductions must not count as ordinary unread chat messages.

## 7. Persistent chat and realtime delivery

### Persistence and API writes

All mutations use HTTP, including sends/read cursors, to keep one CSRF/idempotency path. Socket.IO is server push. Only active-conversation participants with valid sessions/accounts and no block may send. Authorize and insert in one transaction that serializes with close/block/deletion; derive sender from session.

Default message limit: 1–2,000 trimmed plain-text characters, rendered with React escaping. No raw HTML, attachments or rich Markdown.

Each send includes a clientRequestId. Enforce uniqueness per conversation/authorSlot/request ID; same-key changed body conflicts. Persist before acknowledging and broadcasting. “Sent” means stored, not read/delivered to a mailbox. Merge sender HTTP response and socket events by stable message ID to avoid duplicate bubbles.

Use globally increasing message IDs with conversation-scoped indexes. Default history page 30/max 100; afterId for catch-up or beforeId for older history, never both. Include hasMore/cursors. Read cursors advance monotonically after messages render visibly, must belong to that conversation, and affect only the caller's side. Derive unread counts from the other author's messages above the cursor. Seen receipts are deferred.

### Gateway

- Run Socket.IO with Nest on the same HTTP server, proposed namespace `/realtime`, path `/socket.io`. No Redis adapter for one replica.
- Authenticate using the same local session cookie. Validate exact browser Origin for initial transport requests and WebSocket upgrades; CORS alone is insufficient. Reject invalid/revoked/expired/suspended/deleting users.
- Server selects the authenticated user's internal room. No client-selected user rooms, arbitrary join events or socket-based send mutation. Preserve DTO allowlists and limits.
- Events after commit: request.received, request.updated, conversation.created, message.created, conversation.closed, plus minimal summary/contact invalidations if needed. Payloads contain stable resource IDs and authorized fields only. Do not send contact values in general events.
- Before private fan-out verify current recipient/session/conversation access. A previous handshake or stale room membership is not permanent permission. Disconnect on logout/expiry/suspension/deletion; stop pair delivery immediately on block/close.
- Deliver to authorized tabs of both participants, including the sender. Bound sockets per user/IP, payload size, reconnect rate and outbound buffering; disconnect slow consumers rather than grow memory without bound.
- Proposed latency acceptance target: p95 commit-to-receiver-render below one second in a recorded two-browser/modest-load test. Report environment/network conditions and actual measurements; do not claim a global guarantee.

### Recovery

SQLite history is authoritative; socket events are transient. On connect/reconnect, reauthenticate, attach listeners and fetch request/conversation snapshots plus incremental messages. Buffer/merge live events during snapshot synchronization to avoid boundary gaps, and fetch all catch-up pages. Refetch uncertain state on focus or a detected gap.

Back off reconnects with jitter, show reconnecting/offline status and keep failed drafts. A crash after DB commit but before broadcast must recover via HTTP history. Default: disable Socket.IO in-memory connection-state replay and use explicit HTTP synchronization. If replay is later enabled it must not bypass auth or replay after access changes.

Offline users recover history on their next visit. Closed-tab push/email notifications are deferred. Socket.IO's transport-level long-poll fallback, if retained, needs equivalent security; it is distinct from scheduled five-second chat refresh.

## 8. Discord, contact email and disclosure

External contact is optional and separate from 42 login. No Discord DM sending/reading, server joining or email conversation synchronization is requested. Native chat works without either contact method.

### Discord

Support both routes with distinct labels: **Discord linked via OAuth** and **Self-declared handle**. OAuth proves control at linking time, not reliability, permanent ownership or verification of a separate typed handle. Each contact has explicit sharing off by default.

OAuth linking starts in authenticated settings. Bind one-use OAuth state to provider=DISCORD, purpose=LINK, initiating local user/session and browser. Reject expired/replayed/cross-session callbacks and identity collisions; never transfer accounts or merge by email/username. It cannot create a 42-less account.

Use authorization-code exchange server-side, exact registered callback, and minimal identify scope. Discord email/connections/bot/guild/DM scopes are unnecessary for this feature. Fetch the identity, store stable string provider ID and allowlisted display fields, then discard tokens when no ongoing access is needed. Unique provider/providerUserId plus user/provider constraints prevent silent reassignment. Verify current PKCE capabilities rather than guessing.

Manual entry is format/length validated and always SELF_DECLARED. If both records exist, show their provenance distinctly and which value the owner shares. Unlinking removes OAuth data/disclosure and never converts it to a verified manual contact. Relinking refreshes provider display fields. Validate profile-link behavior; offer copyable handle/ID where needed without promising a DM can be delivered.

### Email verification

User enters an optional contact email. Do not automatically reuse provider email; provider data does not bypass Peer's required verification link. Email is not a local account key, login recovery method or marketing consent.

1. Validate syntax/length. Setting/changing/removing the address resets verification, disables sharing and invalidates outstanding challenges. Store the exact address/version privately.
2. Generate a high-entropy single-use token. Store only its hash, owner/contact ID, exact address/version, expiry and consumedAt. Default expiry: 30 minutes. Atomically consume once only for the current address and authenticated owning account.
3. Build a fixed APP_ORIGIN verification URL. Default: `/settings/contact-email/verify#token=<opaque>`; frontend removes the fragment and submits the secret in an HTTPS POST body. No token in logs, analytics, localStorage or OAuth return paths.
4. GET renders confirmation only; POST with session/CSRF consumes the token, so mail scanners do not verify via GET. Reject another account, replay, expiry or address mismatch. A signed-out user signs in and reopens the original link.
5. Send via a configured HTTPS transactional email API, with fixed escaped template, verified sending identity/domain and bounded timeout. Never hold a DB transaction during network delivery. Rate-limit per user/address/IP; default three resends/15 minutes/user with a broader daily ceiling. New challenges invalidate older ones.
6. Delivery failure/timeouts invalidate that attempt and show retryable state; never pretend it verified/sent successfully. Verification marks only the current email verified. Sharing stays off until the owner enables it.

Use an HTTPS API on Railway Hobby: SMTP is currently blocked below Pro. Peer sends verification mail only; email message notifications are deferred. Authorized peers may copy the verified address or open a safely constructed mailto URI. Never accept raw mail headers or arbitrary schemes.

### Disclosure predicate

The contact endpoint must check all of these server-side: active accepted pair connection, permitted current accounts, no either-direction block, owner's per-contact sharing opt-in, and current link verification for email. Owner settings can show their own values. Discovery/profile/request previews and ordinary socket events must not include contact values.

Use private/no-store responses. Unshare, unlink, block, close and deletion stop future access and invalidate displayed app data. Explain that Peer cannot retract details already copied or enforce its block inside Discord/email.

## 9. Data model and invariants

Logical schema below; generate actual Prisma models/migrations using selected versions. Use foreign keys, explicit writable/response mappings and custom SQLite CHECK constraints where needed. TypeScript enum/ID types alone do not enforce database/business rules.

| Entity | Required shape and constraints |
| --- | --- |
| User | Internal id; unique fortyTwoId; mutable login; displayName/avatar; verified campus/cursus cache; local bio/languages/skills; visible, onboardedAt, profileSyncedAt, suspendedAt, deletionRequestedAt; timestamps |
| Session | userId, unique tokenHash, CSRF state as required by library, expiresAt; user/expiry indexes; cascade on account removal |
| OAuthAttempt | provider, LOGIN/LINK purpose, optional initiatingUser/session, unique stateHash, browserNonceHash, protected recoverable PKCE verifier if used, allowlisted returnPath, expiry; consume once |
| ExternalIdentity | userId, DISCORD provider, providerUserId as string, display fields, linkedAt, sharing=false; unique provider/providerUserId and user/provider |
| ContactMethod | userId, EMAIL or DISCORD_MANUAL, value/version, provenance, verifiedAt?, sharing=false; unique user/kind |
| EmailVerification | user/contact ID, contactVersion/emailSnapshot, unique tokenHash, expiry/consumedAt; invalidate on change/resend; cascade on account removal |
| Project | Internal id, optional unique providerProjectId, unique slug, name, enabled; no fixture IDs |
| UserProject | Optional verified progress cache with unique user/project and sync timestamp; omit if no v1 UI uses it |
| SearchIntent | userId, projectId?, derived scopeKey, purpose, active, schedule/timezone, goal?, confirmedAt/expiresAt; unique user/scope/purpose; indexes purpose/scope/active/expiry |
| DiscoverySkip | fromIntentId, toIntentId, createdAt; unique directional intent pair; private latest-skip undo |
| ContactRequest | requesterId/recipientId, canonical low/high intent IDs, snapshotted project/general/purpose context, intro, state, clientRequestId, conversationId?, expiry/respondedAt; unique intent pair and requester/request key |
| Conversation | Canonical userLowId/userHighId, ACTIVE/CLOSED, low/high read cursor, createdAt/closedAt; unique live user pair; user refs nullable on deletion; accepted requests provide context |
| Message | Increasing integer id; conversationId; senderId nullable on account deletion; immutable authorSlot LOW/HIGH; clientRequestId, body, timestamp; unique conversation/authorSlot/request key; index conversation/id |
| Block | blocker/blocked IDs, createdAt; unique directional pair, no self-block, reverse lookup index; delete identity-linked records when account purged |
| Report | reporter/reported refs, authorized request/conversation/message evidence refs, bounded reason/details, status/review timestamps; restrict operator access; nullable refs/scrub policy on deletion |
| DeletionTask | Durable account purge job, requestedAt, state, attempt/error metadata; never depend only on a timer; retain only minimal restore receipt after purge |

Canonical ordering must be stable. Validate that request participants own the referenced intentions, roles/scopes are compatible, message sender matches its slot, and a conversation is created only by recipient acceptance. Use atomic transitions and unique constraints, with bounded contention retries.

Deletion requires nullable account/intent references and deliberate SetNull/cascades; do not cascade-delete the survivor's Conversation/Message history. Retain authorSlot without retaining deleted identity. Allow nulls only for deleted sides; enforce distinct canonical live users and CLOSED status if either side is deleted. SQLite permits multiple null-containing unique pairs; validate live-pair uniqueness and deletion behavior in actual migrations/tests.

Key invariants: one local identity per 42 ID; one DM per live user pair; no full chat before acceptance; retries cannot duplicate requests/conversations/messages; blocks apply across HTTP/socket/contact paths; provider sync cannot overwrite local input; manual handles never acquire OAuth badges; verified email and sharing are independent conditions; permission revocation affects existing sockets.

## 10. API outline

Protected by local session except OAuth login/callback and minimal health. All business mutations require CSRF; OAuth callbacks have state protection. Return allowlisted DTOs, never raw ORM relations.

| Routes | Responsibility |
| --- | --- |
| GET `/api/auth/42`, GET `/api/auth/42/callback` | Login flow |
| GET `/api/auth/session` | Own identity/session and CSRF bootstrap |
| POST `/api/auth/logout`, POST `/api/auth/logout-all` | Revoke sessions/disconnect sockets |
| GET/PATCH `/api/me`, POST `/api/me/onboarding` | Profile, opt-in and onboarding |
| DELETE `/api/me` | Recent 42 reauthentication + CSRF; durable deletion request |
| GET `/api/projects` | Enabled catalog; general discussion does not require a project |
| GET/POST `/api/me/intents`, PATCH `/api/me/intents/:id` | Owned intentions, renew/pause |
| GET `/api/discovery`, GET `/api/peers/:id` | Eligible filtered discovery/authorized profile |
| POST `/api/skips`, POST `/api/skips/undo` | Private skips |
| POST/GET `/api/requests` | Intro submission and bounded inbox/outbox |
| POST `/api/requests/:id/accept`, `/decline`, `/cancel` | Recipient/requester-only state transitions |
| GET `/api/conversations`, POST `/api/conversations/:id/close` | Owned DM list/archive |
| GET/POST `/api/conversations/:id/messages` | Authorized history and idempotent sends |
| POST `/api/conversations/:id/read` | Advance own cursor |
| GET/PATCH `/api/me/contacts` | Own values, verification and sharing settings |
| GET `/api/peers/:id/contact` | Acceptance + opt-in + block/verification checks |
| GET `/api/me/connections/discord/start`, `/callback`; DELETE `/api/me/connections/discord` | Session-bound link/unlink |
| POST `/api/me/contact-email/verification`, `/verify` | Rate-limited send/resend and single-use verification |
| GET `/api/me/blocks`; POST `/api/blocks`; DELETE `/api/blocks/:userId` | Own block settings |
| POST `/api/reports` | Authorized evidence/report |
| GET `/api/health` | Readiness after DB/migrations, no secrets |

Use consistent error codes/request IDs: 400 invalid input, 401 session failure, 403 CSRF/account restriction, 404 inaccessible resources, 409 state/idempotency conflict, 429 throttling, sanitized 5xx. Bound request bodies, tags, pagination, IDs, enums and text. Register Nest DTO validation/guards globally as appropriate; static types do not validate runtime input.

Default write limits beyond introductions/email: auth starts 10/min/IP; profile writes 10/min/user; skips 30/min/user; messages 30/min/user and 10/min/conversation/user; reports five/hour/user. Add bounded overall IP and socket limits. Return Retry-After where appropriate; tune actual limits with usage. Do not confuse limits with authorization.

## 11. Blocking, deletion and retained history

Block removes both discovery directions, invalidates pending requests, closes pair DMs and stops message/contact/socket delivery immediately. It does not tell the target who blocked them. Unblocking does not reopen chats. Default history remains read-only for existing participants, subject to deletion policy.

Reports are private. Provide an authenticated local operator CLI to list/review/resolve and suspend/unsuspend accounts; no public admin API/UI required. Capture only authorized, minimal evidence. Suspension revokes sessions and realtime access. Document retention and who handles reports before public launch; do not keep raw provider identity secretly as an unspecified permanent ban list.

### Confirmed account-deletion behavior

Retain history for the other participant with deleted-user attribution. This means removing profile/identity associations; free-text messages may still contain names or other personal information. Do not promise that retaining message text constitutes complete anonymization.

- Require recent 42 reauthentication plus CSRF for deletion. Record a durable job; immediately hide the account, invalidate requests, revoke all sessions, disconnect sockets, disable contact sharing and close DMs.
- Default complete purge within 24 hours, retrying durable jobs after restarts. Idempotent transaction(s) remove 42/Discord identity, local profile, contacts, verification/auth/session secrets, intentions, private skips and unnecessary pending/terminal requests.
- Preserve surviving participant's conversation, message bodies/order and minimal accepted project/purpose context. Clear deleted sender/account/intent foreign keys; render Deleted user with a neutral avatar and immutable conversation-local authorSlot. Do not leave login/avatar/provider ID/email/Discord handle in denormalized labels or ordinary cached DTOs.
- Scrub accepted-request identity metadata while preserving its intro as history only if needed. Keep project/purpose snapshots independent of deleted intentions. Report identity/evidence retention follows the disclosed minimal operator policy, not accidental ORM cascades.
- The survivor can read the archive but cannot send to the deleted user. A newly registered account must never regain an old user's conversation through matching provider login/email.
- If no live participant remains, default remove the now-unneeded conversation/history rather than retain orphan chat forever.
- Retained messages may include self-disclosed contacts. Explain this in the deletion confirmation and privacy notice; provide a documented route for operator review/redaction requests rather than claiming automatic content anonymization.
- Existing immutable backups age out according to documented schedules; deletion is not instantaneous erasure of every backup. Preserve a minimal deletion receipt/journal containing former internal IDs and timestamps (no raw provider/contact data) through the maximum restore window, then expire it.
- Before restore, preserve the latest deletion journal outside the volume being rolled back and reapply post-snapshot deletion jobs before opening traffic. If disaster recovery must survive total volume loss, keep an access-restricted off-volume journal/export too. Do not restore deleted identities into public access silently.

The privacy notice must explain provider data, visibility, request consent, external sharing, retained text, deletion timing, reports and backup retention. This technical guide does not establish legal compliance.

## 12. Railway deployment and operating cost

**Confirmed host: Railway.** Budget remains undecided; do not buy or deploy as part of producing this guide.

### Deployment requirements

1. One Railway application service, one region/replica, built with the supplied multi-stage Dockerfile. Nest serves assets/API/socket traffic. No separate Postgres/Redis service, Vite server, Nginx or Caddy on Railway.
2. Mount a persistent Railway Volume at `/data`; runtime `DATABASE_URL=file:/data/peer.db`. Keep DB/WAL/SHM and backups out of the frontend/static directory and image. Verify volume mount/permissions before readiness; fail rather than silently falling back to ephemeral storage.
3. Build/install/generate Prisma in the image without touching production data. Railway volumes are unavailable during builds AND pre-deploy commands: run SQLite production migrations in the runtime start sequence after mounting `/data`, then start Nest. Do not put these volume migrations in Railway's pre-deploy hook.
4. Back up before migrations. Start must fail on migration error; no destructive reset/db-push/dev migration against production. Use selected-version `prisma migrate deploy` and supported schema/client generation.
5. Listen on `0.0.0.0` and Railway's injected PORT. Configure `/api/health` to succeed only after DB readiness. Respect Railway healthcheck host handling without weakening auth/origin policy on other routes.
6. Railway supplies HTTPS and supports WebSockets. Configure APP_ORIGIN and exact callback URLs with the actual generated/custom domain, secure cookies, proxy trust and socket Origin validation. Verify socket handshake/upgrades and reconnect through the real deployment.
7. A volume-backed service has brief redeploy downtime even with healthchecks. Document it, configure graceful shutdown/draining and client recovery; do not promise zero-downtime releases. Keep one replica while using local SQLite.
8. Resolve Railway volume ownership deliberately. Prefer a narrowly privileged bootstrap if ownership adjustment is required, then a non-root runtime where supported; document any platform-required exception. Do not silently ignore EACCES or run a privileged container.
9. Use an HTTPS transactional email API on Hobby; SMTP is currently Pro-only. Verify sending domain/identity and deliverability before claiming email verification works. A Railway app URL alone does not establish ownership of an email sender domain.
10. Supply local Compose for development/smoke checks and Railway-specific configuration/runbook. Keep actual secrets in Railway variables, not the repository or frontend.

### Required environment documentation

Document NODE_ENV, PORT, APP_ORIGIN, DATABASE_URL, FORTYTWO_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI, DISCORD_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI, selected MAIL_API_KEY/MAIL_FROM or provider-equivalent fields, and only session/encryption keys actually required by chosen libraries. Production must fail on missing critical configuration. Examples contain placeholders only.

### Cost and launch constraints

Checked 6 November 2026: Railway Hobby has a $5/month minimum including $5 of usage, not a fixed $5 maximum. Usage above it increases the bill; transactional mail, sender-domain registration and any independent backups may be additional. No DH conversion or total bill is asserted.

Before paid deployment: show actual selected-plan prices, estimate memory/CPU/volume/backup/egress/mail usage, get the owner's ceiling, and configure appropriate usage alerts. A Railway hard compute limit takes workloads offline; make that tradeoff explicit. Do not apply an arbitrary hard limit from this document.

Run a bounded staging measurement, initially around 20 concurrent active clients and 1,000 synthetic opted-in profiles. Record API latency, commit-to-render p95, memory/CPU, write contention, storage and socket traffic; extrapolate costs with assumptions. A 1-vCPU/1-GiB test environment is an evaluation target, not a measured capacity guarantee. Revisit database/runtime size from evidence.

### Backup and recovery

Enable Railway daily volume backups. Current daily schedule retains six days; weekly/monthly schedules retain data longer and need deliberate privacy/cost decisions. Manual snapshots also need lifecycle tracking. Railway backup sizes are billed; wiping a volume deletes its backups, so these alone do not protect against every platform/account-loss scenario.

Test restoring SQLite with the whole relevant volume state, including WAL when present; run SQLite integrity checks and representative app reads. Also provide an online-backup/.backup-based portable snapshot command. Copying a live `.db` without accounting for WAL is insufficient; a second file on the same volume is not independent disaster recovery.

Document restore, deletion-journal replay, migration compatibility and secret handling. Target recovery point at most 24 hours and manual recovery within two hours as defaults, not guarantees. Specify where independent encrypted snapshots/journal copies would live if required; keep their cost within the eventual ceiling. Never run a destructive restore against live data merely to test it.

## 13. UI and implementation quality

Add login/failure, onboarding, editable profile/intentions, intro composer, request inbox/outbox, accepted DMs, settings for contacts/verification/sharing, block/report and deletion confirmation using the current design language.

Provide loading, empty, expired-intention/request, failed send, offline/reconnecting, closed chat, pending verification, verified/unshared email and delivery-failure states. Optimistic actions must roll back/refetch on error. Keep failed drafts and merge canonical responses/events.

Preserve keyboard accessibility without swiping from form controls. Provide click alternatives to dragging, visible focus, labeled inputs, dialog containment/focus restore and reduced-motion support. No fake statistics or fixture match popups in production. Actual acceptance triggers the connection confirmation.

Show project/general context inside the continuing DM, distinguish request badges from unread messages, and make optional contact actions appear only after authorized disclosure. Validate HTTPS avatar URLs; do not add an arbitrary remote image-fetching proxy.

Security essentials: server-side ownership/resource authorization on every route, DTO field allowlists, safe Prisma queries, current session checks on sockets, CSRF/Origin controls, TLS, bounded input/timeouts/rate limits, application-compatible security headers/CSP, and redacted errors/logs. Never log OAuth codes, tokens, cookies, verification URLs, contact values, message bodies or raw provider responses.

## 14. Build order, verification and definition of done

### Phases

1. Inspect repository/instructions; restructure without unnecessary redesign; pin compatible tooling; configure Nest/Prisma/SQLite/DTO validation and production routing.
2. Implement 42 adapter, one-use login attempts, local sessions/CSRF, eligibility, onboarding/profile/intentions and logout. Keep live-provider verification distinct from stub tests.
3. Implement compatible discovery, private skips, request inbox/outbox, accept/decline/cancel/expiry, atomic one-DM creation and context preservation.
4. Implement persistent HTTP chat, Socket.IO push, history/reconnect recovery, read cursors, close/block/report and operator CLI.
5. Implement both Discord methods, sharing authorization, email verification delivery/token lifecycle, deletion/preserved history and privacy notice.
6. Complete Railway packaging/startup migrations, persistent-volume/redeploy tests, real callbacks/cookies/socket/email smoke tests, backup/restore runbook, deletion replay and bounded performance/cost measurement.

### Required meaningful tests

| Scenario | Expected evidence |
| --- | --- |
| First/returning/renamed 42 login; concurrent login | Single correct identity; no local-profile overwrite |
| Forged/cross-browser/expired/replayed state; provider error | No authenticated session or discoverable partial user |
| Expired/revoked/suspended/deleting user | HTTP denied; existing sockets lose private access |
| CSRF, wrong owner and malicious extra DTO fields | No unauthorized state changes or privilege fields |
| General scope/duplicate general intentions | General discussion works; unique scope rule enforced |
| JOIN_TEAM to JOIN_TEAM; other-campus student | Allowed under verified eligibility; no managed team side effect |
| Self-request/incompatible scope/hidden-expired target | No invalid request or acceptance |
| Third party/sender accepts; message before acceptance | Denied, with no conversation/message side effect |
| Concurrent opposite intros/repeated acceptance | One pair request and one canonical pair DM |
| Same users reconnect around another project | Existing active DM reused; context retained |
| Decline/cancel/expiry/block races with acceptance | One valid terminal outcome; no invalid conversation |
| Wrong conversation/message/read-cursor IDs | No private reads or cross-chat changes |
| Send retry; same key/different content; HTTP + socket echo | One stored/visible message; changed content conflicts |
| Socket Origin/session spoof; arbitrary room attempt | Denied without private event access |
| Disconnect/restart; commit succeeds but push lost | HTTP catch-up restores complete, deduplicated history |
| Block/close/delete while sender/socket active | No subsequent unauthorized send/contact/event |
| Forged/replayed/cross-session Discord link; identity collision | No unauthorized linkage/account transfer; no 42-less account |
| Manual handle vs OAuth link | Correct distinct provenance; editing/manual entry cannot earn OAuth badge |
| Unaccepted/blocked/unsharing contact lookup | No contact value in API/profile/request/socket output |
| Email changed/unverified/superseded/other-owner/replayed token | No wrong-address verification or disclosure |
| Concurrent token consumption; scanner GET; mail failure | Single use; GET no mutation; failure never verifies/shares |
| Email verified but sharing off | Address remains private |
| Delete one participant | Identity/contact removed; survivor sees Deleted user archive, preserved text/context, no sends |
| Both participants deleted; re-register same 42 identity | No orphan retention by default; no access to previous deleted account's chat |
| Railway deploy/start/redeploy and backup restore | Mounted DB persists; no ephemeral fallback; integrity and deletion replay verified |
| Recorded online/load measurement | Actual p95/resource use/cost assumptions, not an unsupported capacity claim |

Run existing meaningful tests plus HTTP/socket integration tests against real SQLite, type checks and production builds. Test positive and denied paths, retries and concurrency. Clearly distinguish stub/provider tests, new/pre-existing failures and unrun checks. Never call a fake adapter a live integration.

### Definition of done

Two eligible consenting real 42 users can sign in, opt in for compatible project/general intentions, introduce/accept, use one ongoing DM with near-instant online delivery, reload/reconnect without losing messages, and safely close/block/report. Discord OAuth/manual labels, accepted opt-in contact sharing and email-link verification work. Account deletion removes identity and preserves the survivor's Deleted user history. Railway redeploy and tested recovery retain data and respect deletion. Current visual language remains. Required live-provider/mail checks and launch configuration are complete, or reported clearly as pending rather than called production-ready.

## 15. Useful additions and launch decisions

Already included defaults: Team full / pause, expiring availability, factual overlap context and project/general context in a continuing DM.

| Later addition | Value | Why deferred |
| --- | --- | --- |
| Working-style prompts | Set pace, communication and learning expectations | Small optional profile expansion |
| Project-specific icebreakers | Help intros ask useful questions | Small content/UI improvement |
| Weekly availability slots | More precise timezone overlap | More input and matching complexity |
| Guidance offers/requests | Connect learners and willing mentors | Requires asymmetric rules beyond discussion |
| Saved searches/push | Bring users back when relevant peers join | Separate delivery/permission decisions |
| Collaboration endorsements | Feedback after working together | Needs eligibility/anti-abuse rules; no fake public scores |
| Managed teams | Rosters, invitations and vacancies | Explicitly outside current individual-connection scope |

Do not keep expanding before users form useful conversations. Suggested minimal aggregate signals: active confirmed intentions, intro acceptance, first replies, self-reported team formed and report rate; no tracking service required by default.

Remaining launch decisions are host plan/actual ceiling, mail provider/sending domain, exact 42 eligibility mapping/project catalog, report-review ownership/retention, independent backup/journal destination if required, and initial recruitment/load assumptions. These are not unanswered choices about general chat, teams, first contact, external sharing, DM reuse or deletion: those product choices are confirmed above. Keep routine defaults visible; ask only when a remaining choice materially changes behavior, cost or access.

## 16. Sources and verification status

Checked 6 November 2026. Technical sources support feasibility; this document is not a security certification, legal assessment or measured hosting quote.

- [Repository](https://github.com/MliliGenes/42-peer-tinder): inspected prototype source/README and demo limitations.
- [42 API documentation](https://api.intra.42.fr/apidoc): sign-in gated during planning; full provider parameters/schema/live application test still required.
- [Nest static serving](https://docs.nestjs.com/recipes/serve-static), [validation](https://docs.nestjs.com/techniques/validation), [CSRF](https://docs.nestjs.com/security/csrf), [gateways](https://docs.nestjs.com/websockets/gateways).
- [Prisma SQLite](https://www.prisma.io/docs/orm/overview/databases/sqlite): local SQLite/adapter support; use selected-major configuration.
- [SQLite uses](https://sqlite.org/whentouse.html), [WAL](https://www.sqlite.org/wal.html), [online backup](https://www.sqlite.org/backup.html).
- [Socket.IO delivery](https://socket.io/docs/v4/delivery-guarantees/) and [recovery](https://socket.io/docs/v4/connection-state-recovery/): application persistence/synchronization remains necessary.
- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2) and [user resource](https://docs.discord.com/developers/resources/user): identify vs email/connections scopes and stable identity fields.
- [Railway pricing](https://docs.railway.com/pricing) and [cost control](https://docs.railway.com/pricing/cost-control): usage commitment, variable resource costs and hard-limit consequences.
- [Railway volumes](https://docs.railway.com/volumes) and [volume reference](https://docs.railway.com/volumes/reference): persistent mount and startup/pre-deploy limitations.
- [Railway backups](https://docs.railway.com/volumes/backups): current schedules, retention and wipe/restore caveats.
- [Railway healthchecks](https://docs.railway.com/deployments/healthchecks): volume-backed redeploy downtime and PORT/readiness behavior.
- [Railway outbound networking](https://docs.railway.com/networking/outbound-networking): SMTP plan restriction and HTTPS email APIs.
- [Railway network specs](https://docs.railway.com/networking/public-networking/specs-and-limits): HTTPS/WebSocket support.
