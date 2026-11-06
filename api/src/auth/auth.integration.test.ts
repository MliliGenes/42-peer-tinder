import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { PrismaService } from '../database/prisma.service';

function setCookie(headers: Headers, name: string): string {
  const value = headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(value, `expected ${name} cookie`);
  return value.split(';', 1)[0];
}

test('real SQLite OAuth/session flow enforces state, eligibility, CSRF and logout-all', async (t) => {
  const databasePath = `/tmp/peer-auth-integration-${process.pid}.db`;
  const databaseUrl = `file:${databasePath}`;
  const previousEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    FORTYTWO_CLIENT_ID: process.env.FORTYTWO_CLIENT_ID,
    FORTYTWO_CLIENT_SECRET: process.env.FORTYTWO_CLIENT_SECRET,
    FORTYTWO_REDIRECT_URI: process.env.FORTYTWO_REDIRECT_URI,
    FORTYTWO_ELIGIBLE_CURSUS_IDS: process.env.FORTYTWO_ELIGIBLE_CURSUS_IDS,
  };
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:5173',
    FORTYTWO_CLIENT_ID: 'integration-client',
    FORTYTWO_CLIENT_SECRET: 'integration-secret',
    FORTYTWO_ELIGIBLE_CURSUS_IDS: '21',
  });
  delete process.env.FORTYTWO_REDIRECT_URI;

  let app: any;
  const realFetch = globalThis.fetch;
  const tokenRequestBodies: URLSearchParams[] = [];
  t.after(async () => {
    globalThis.fetch = realFetch;
    if (app) await app.close();
    rmSync(databasePath, { force: true });
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
    rmSync(`${databasePath}-journal`, { force: true });
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === 'object');
    const apiOrigin = `http://127.0.0.1:${address.port}`;
    process.env.FORTYTWO_REDIRECT_URI = `${apiOrigin}/api/auth/42/callback`;

    let providerCursusId = 21;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.intra.42.fr/oauth/token') {
        tokenRequestBodies.push(new URLSearchParams(init?.body as URLSearchParams));
        return new Response(JSON.stringify({ access_token: 'integration-access-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.intra.42.fr/v2/me') {
        return new Response(JSON.stringify({
          id: 42,
          login: 'integration-peer',
          displayname: 'Integration Peer',
          image: { link: 'https://cdn.example.invalid/avatar.png' },
          cursus_users: [{ cursus_id: providerCursusId, cursus: { name: 'Test cursus' } }],
          campus_users: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const httpFetch = realFetch;
    async function login() {
      const start = await httpFetch(`${apiOrigin}/api/auth/42?returnTo=%2Fsettings`, { redirect: 'manual' });
      assert.equal(start.status, 302);
      const authorizeUrl = new URL(start.headers.get('location')!);
      assert.equal(authorizeUrl.origin, 'https://api.intra.42.fr');
      const state = authorizeUrl.searchParams.get('state')!;
      const codeChallenge = authorizeUrl.searchParams.get('code_challenge');
      assert.ok(codeChallenge);
      assert.equal(authorizeUrl.searchParams.get('code_challenge_method'), 'S256');
      const browserCookie = setCookie(start.headers, 'peer_oauth_browser');

      const forged = await httpFetch(`${apiOrigin}/api/auth/42/callback?state=forged&code=code`, {
        headers: { cookie: browserCookie },
        redirect: 'manual',
      });
      assert.equal(forged.status, 401);

      const tokenRequestIndex = tokenRequestBodies.length;
      const callback = await httpFetch(`${apiOrigin}/api/auth/42/callback?state=${encodeURIComponent(state)}&code=stub-code`, {
        headers: { cookie: browserCookie },
        redirect: 'manual',
      });
      const tokenRequest = tokenRequestBodies[tokenRequestIndex];
      assert.ok(tokenRequest);
      const codeVerifier = tokenRequest.get('code_verifier');
      assert.ok(codeVerifier);
      assert.equal(createHash('sha256').update(codeVerifier, 'ascii').digest('base64url'), codeChallenge);
      return callback;
    }

    const firstLogin = await login();
    assert.equal(firstLogin.status, 302);
    assert.equal(firstLogin.headers.get('location'), 'http://localhost:5173/settings');
    const firstSession = setCookie(firstLogin.headers, 'peer_session');
    const firstCsrf = setCookie(firstLogin.headers, 'peer_csrf');
    const firstCookieHeader = `${firstSession}; ${firstCsrf}`;

    const sessionResponse = await httpFetch(`${apiOrigin}/api/auth/session`, {
      headers: { cookie: firstCookieHeader },
    });
    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(sessionResponse.headers.get('content-security-policy'), "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const sessionBody = await sessionResponse.json() as any;
    assert.equal(sessionBody.user.login, 'integration-peer');
    assert.equal(sessionBody.user.onboarded, false);
    assert.equal(sessionBody.user.visible, false);
    assert.equal(JSON.stringify(sessionBody).includes('fortyTwoId'), false);

    const csrfToken = decodeURIComponent(firstCsrf.slice('peer_csrf='.length));
    const onboardingPayload = JSON.stringify({ bio: 'Looking for a thoughtful teammate.', visible: true });
    const onboardingWithoutOrigin = await httpFetch(`${apiOrigin}/api/me/onboarding`, {
      method: 'POST',
      headers: { cookie: firstCookieHeader, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      body: onboardingPayload,
    });
    assert.equal(onboardingWithoutOrigin.status, 403);
    const onboardingWithoutOptIn = await httpFetch(`${apiOrigin}/api/me/onboarding`, {
      method: 'POST',
      headers: {
        cookie: firstCookieHeader,
        origin: 'http://localhost:5173',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bio: '', visible: false }),
    });
    assert.equal(onboardingWithoutOptIn.status, 400);
    const onboarding = await httpFetch(`${apiOrigin}/api/me/onboarding`, {
      method: 'POST',
      headers: {
        cookie: firstCookieHeader,
        origin: 'http://localhost:5173',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      body: onboardingPayload,
    });
    assert.equal(onboarding.status, 200);
    const completedSession = await httpFetch(`${apiOrigin}/api/auth/session`, {
      headers: { cookie: firstCookieHeader },
    });
    const completedBody = await completedSession.json() as any;
    assert.equal(completedBody.user.onboarded, true);
    assert.equal(completedBody.user.visible, true);
    assert.equal(completedBody.user.bio, 'Looking for a thoughtful teammate.');

    const intentHeaders = {
      cookie: firstCookieHeader,
      origin: 'http://localhost:5173',
      'x-csrf-token': csrfToken,
      'content-type': 'application/json',
    };
    const emptyIntentions = await httpFetch(`${apiOrigin}/api/me/intents`, { headers: { cookie: firstCookieHeader } });
    assert.equal(emptyIntentions.status, 200);
    assert.deepEqual((await emptyIntentions.json() as any).intents, []);
    const emptyProjects = await httpFetch(`${apiOrigin}/api/projects`, { headers: { cookie: firstCookieHeader } });
    assert.equal(emptyProjects.status, 200);
    assert.deepEqual((await emptyProjects.json() as any).projects, []);

    const intentWithoutOrigin = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST',
      headers: { cookie: firstCookieHeader, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'DISCUSS' }),
    });
    assert.equal(intentWithoutOrigin.status, 403);
    const projectRequired = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST', headers: intentHeaders, body: JSON.stringify({ purpose: 'JOIN_TEAM' }),
    });
    assert.equal(projectRequired.status, 400);

    const joinIntentResponse = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST',
      headers: intentHeaders,
      body: JSON.stringify({ purpose: 'JOIN_TEAM', projectName: 'libft', schedule: 'EVENING', timeZone: 'America/Toronto', goal: 'Find a steady pair.' }),
    });
    assert.equal(joinIntentResponse.status, 200);
    const joinIntent = (await joinIntentResponse.json() as any).intent;
    assert.equal(joinIntent.scopeKey, 'project:libft');
    assert.equal(joinIntent.project.name, 'libft');
    assert.equal(joinIntent.project.source, 'self-reported');
    assert.equal(joinIntent.schedule, 'EVENING');
    assert.equal(joinIntent.timeZone, 'America/Toronto');
    assert.ok(new Date(joinIntent.expiresAt).getTime() > Date.now() + 13 * 24 * 60 * 60 * 1_000);

    const duplicateIntent = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST', headers: intentHeaders,
      body: JSON.stringify({ purpose: 'JOIN_TEAM', projectName: 'Libft' }),
    });
    assert.equal(duplicateIntent.status, 409);
    const recruitIntentResponse = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST', headers: intentHeaders,
      body: JSON.stringify({ purpose: 'RECRUIT_TEAM', projectName: 'cpp-module' }),
    });
    assert.equal(recruitIntentResponse.status, 200);
    const discussIntentResponse = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST', headers: intentHeaders,
      body: JSON.stringify({ purpose: 'DISCUSS', schedule: 'ANY', timeZone: 'UTC' }),
    });
    assert.equal(discussIntentResponse.status, 200);
    const overLimitIntent = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST', headers: intentHeaders,
      body: JSON.stringify({ purpose: 'DISCUSS', projectName: 'webserv' }),
    });
    assert.equal(overLimitIntent.status, 409);

    const intentProjects = await httpFetch(`${apiOrigin}/api/projects`, { headers: { cookie: firstCookieHeader } });
    const projectNames = (await intentProjects.json() as any).projects.map((project: any) => project.name);
    assert.deepEqual(projectNames, ['cpp-module', 'libft']);
    const pausedIntentResponse = await httpFetch(`${apiOrigin}/api/me/intents/${encodeURIComponent(joinIntent.id)}`, {
      method: 'PATCH', headers: intentHeaders, body: JSON.stringify({ active: false }),
    });
    assert.equal(pausedIntentResponse.status, 200);
    assert.equal((await pausedIntentResponse.json() as any).intent.active, false);
    const renewedIntentResponse = await httpFetch(`${apiOrigin}/api/me/intents/${encodeURIComponent(joinIntent.id)}`, {
      method: 'PATCH', headers: intentHeaders, body: JSON.stringify({ renew: true }),
    });
    assert.equal(renewedIntentResponse.status, 200);
    assert.equal((await renewedIntentResponse.json() as any).intent.active, true);
    const fourthIntentAfterPause = await httpFetch(`${apiOrigin}/api/me/intents`, {
      method: 'POST', headers: intentHeaders,
      body: JSON.stringify({ purpose: 'DISCUSS', projectName: 'webserv' }),
    });
    assert.equal(fourthIntentAfterPause.status, 409);

    const wrongOrigin = await httpFetch(`${apiOrigin}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: firstCookieHeader, 'x-csrf-token': csrfToken },
    });
    assert.equal(wrongOrigin.status, 403);
    const wrongToken = await httpFetch(`${apiOrigin}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: firstCookieHeader, origin: 'http://localhost:5173', 'x-csrf-token': 'wrong' },
    });
    assert.equal(wrongToken.status, 403);
    const logout = await httpFetch(`${apiOrigin}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: firstCookieHeader, origin: 'http://localhost:5173', 'x-csrf-token': csrfToken },
    });
    assert.equal(logout.status, 204);

    const secondLogin = await login();
    assert.equal(secondLogin.status, 302);
    const secondCookieHeader = `${setCookie(secondLogin.headers, 'peer_session')}; ${setCookie(secondLogin.headers, 'peer_csrf')}`;
    const prisma = app.get(PrismaService);
    const savedUser = await prisma.user.findUnique({ where: { fortyTwoId: '42' } });
    assert.equal(savedUser?.bio, 'Looking for a thoughtful teammate.');
    assert.equal(savedUser?.visible, true);
    assert.ok(savedUser?.onboardedAt);
    const secondSession = await prisma.session.findFirst({ where: { revokedAt: null } });
    assert.ok(secondSession);
    await prisma.session.update({ where: { id: secondSession.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    assert.equal((await httpFetch(`${apiOrigin}/api/auth/session`, { headers: { cookie: secondCookieHeader } })).status, 401);

    const thirdLogin = await login();
    assert.equal(thirdLogin.status, 302);
    const thirdSessionCookie = setCookie(thirdLogin.headers, 'peer_session');
    const thirdCsrfCookie = setCookie(thirdLogin.headers, 'peer_csrf');
    const logoutAll = await httpFetch(`${apiOrigin}/api/auth/logout-all`, {
      method: 'POST',
      headers: {
        cookie: `${thirdSessionCookie}; ${thirdCsrfCookie}`,
        origin: 'http://localhost:5173',
        'x-csrf-token': decodeURIComponent(thirdCsrfCookie.slice('peer_csrf='.length)),
      },
    });
    assert.equal(logoutAll.status, 204);
    assert.equal((await httpFetch(`${apiOrigin}/api/auth/session`, { headers: { cookie: secondCookieHeader } })).status, 401);

    providerCursusId = 999;
    const ineligibleLogin = await login();
    assert.equal(ineligibleLogin.status, 302);
    assert.equal(new URL(ineligibleLogin.headers.get('location')!).searchParams.get('auth_error'), 'account_unavailable');
    assert.equal(await prisma.user.count(), 1);
    assert.equal(await prisma.session.count(), 3);

    providerCursusId = 21;
    const restrictedAccountLogin = await login();
    assert.equal(restrictedAccountLogin.status, 302);
    const restrictedCookie = `${setCookie(restrictedAccountLogin.headers, 'peer_session')}; ${setCookie(restrictedAccountLogin.headers, 'peer_csrf')}`;
    await prisma.user.updateMany({ data: { suspendedAt: new Date() } });
    assert.equal((await httpFetch(`${apiOrigin}/api/auth/session`, { headers: { cookie: restrictedCookie } })).status, 401);
    assert.equal(await prisma.session.count(), 4);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await httpFetch(`${apiOrigin}/api/auth/42`, { redirect: 'manual' })).status, 302);
  }
  const throttled = await httpFetch(`${apiOrigin}/api/auth/42`, { redirect: 'manual' });
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);
});
