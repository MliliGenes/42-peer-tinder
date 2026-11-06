# Peer project progress

Updated: 2026-11-06

**Status:** working prototype; not ready for public launch. Real peer discovery, introductions, and chat are not implemented yet. The detailed product and security baseline is in [`PEER_REQUIREMENTS.md`](./PEER_REQUIREMENTS.md).

## Done

- React/Vite client, NestJS API, Prisma/SQLite persistence, and Docker Compose development setup.
- Server-side 42 OAuth flow with state/browser binding, S256 PKCE, local sessions, account upsert, logout, and auth rate limits.
- Private onboarding: a new account stays hidden until the user explicitly opts in. Fictional peers are only available in the development demo, not the authenticated account.
- Persistent user bio and initial visibility state, with authenticated profile settings to edit the bio and toggle visibility after onboarding.
- Persistent intentions in the signed-in account: create/list, pause, and renew; up to three active intentions, each lasting 14 days after confirmation. Intentions include purpose, schedule, time zone, optional goal, and optional project scope.
- Basic shared project-name list derived from intentions. Project names are self-reported, not verified against 42.
- Local SQLite migration for intentions applied in the Docker development database.
- Latest checks passed in the Node 22 Docker environment: 8 client tests, 13 API tests, and production builds for client and API. The host Node installation is v12, below the documented Node 22 requirement.

## Eligibility and provider follow-up

- Staff confirmed that active students at 1337 use 42 cursus ID `21`. It is **not yet confirmed** that this covers every 42 campus, which is the app's intended audience.
- The app requires a verified `FORTYTWO_ELIGIBLE_CURSUS_IDS` allowlist. Its current eligibility check matches cursus membership; it does not independently establish active enrollment. Confirm the intended network-wide policy before configuring the allowlist.
- Automated auth tests use controlled provider responses. Do not treat them as verification of all 42 provider behavior or eligibility semantics.
- Discord integration is not started; credentials will be supplied later.

## Remaining work

1. Profile/settings: edit profile details and add an easy way to pause or disable visibility.
2. Real discovery: query eligible, visible peers with compatible intentions; add filters, pagination, and private skips. Never fill the pool with demo data.
3. Introductions: inbox/outbox, send/cancel, and recipient accept/decline flows.
4. Persistent one-to-one conversations and messages, followed by authorized realtime delivery.
5. Safety and account controls: blocking, reporting/moderation, and account deletion with retained-history handling.
6. Contact features: Discord linking/manual handles and verified email sharing with explicit disclosure controls.
7. Production readiness: deployment/runbook, backups, mail provider, operational limits, and end-to-end security checks.

**Suggested next build step:** profile settings and visibility controls, then real discovery. Keep the cursus allowlist unset or otherwise fail-closed until its intended network-wide scope is confirmed.
