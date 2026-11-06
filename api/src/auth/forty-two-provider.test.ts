import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FortyTwoProvider } from './forty-two-provider';

const envKeys = ['FORTYTWO_CLIENT_ID', 'FORTYTWO_CLIENT_SECRET', 'FORTYTWO_REDIRECT_URI'] as const;
const testCodeVerifier = 'A'.repeat(43);

async function withProviderEnvironment(run: () => Promise<void>) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.FORTYTWO_CLIENT_ID = 'test-client';
  process.env.FORTYTWO_CLIENT_SECRET = 'test-secret';
  process.env.FORTYTWO_REDIRECT_URI = 'http://localhost:5173/api/auth/42/callback';
  try {
    await run();
  } finally {
    for (const key of envKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('exchanges the code and returns only allowlisted 42 profile fields', async () => {
  await withProviderEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'provider-secret', refresh_token: 'discard-me' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        id: 42,
        login: 'student42',
        displayname: 'Student',
        email: 'must-not-be-retained@example.invalid',
        image: { link: 'https://cdn.example.invalid/avatar.png' },
        cursus_users: [
          { cursus_id: 21, level: 4.2, cursus: { name: '42' } },
          { cursus_id: 9, level: 1, cursus: { name: 'Piscine' } },
        ],
        campus_users: [
          { campus_id: 1, campus: { name: 'North' } },
          { campus_id: 2, campus: { name: 'South' } },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    try {
      const provider = new FortyTwoProvider();
      const authorizationUrl = new URL(provider.createAuthorizationUrl('test-state', testCodeVerifier));
      const expectedChallengeText = createHash('sha256')
        .update(testCodeVerifier, 'ascii')
        .digest('base64url');
      assert.equal(authorizationUrl.searchParams.get('code_challenge'), expectedChallengeText);
      assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');

      const token = await provider.exchangeCode('one-time-code', testCodeVerifier);
      const identity = await provider.fetchProfile(token);

      assert.equal(token, 'provider-secret');
      assert.deepEqual(identity, {
        fortyTwoId: '42',
        login: 'student42',
        displayName: 'Student',
        avatarUrl: 'https://cdn.example.invalid/avatar.png',
        cursus: [
          { id: 21, name: '42', level: 4.2 },
          { id: 9, name: 'Piscine', level: 1 },
        ],
        campusMemberships: [
          { id: 1, name: 'North' },
          { id: 2, name: 'South' },
        ],
      });
      assert.equal('email' in identity, false);
      assert.equal(calls[0].url, 'https://api.intra.42.fr/oauth/token');
      assert.equal(calls[1].url, 'https://api.intra.42.fr/v2/me');
      assert.match(String(calls[1].init?.headers && new Headers(calls[1].init.headers).get('authorization')), /^Bearer provider-secret$/);
      const tokenBody = new URLSearchParams(calls[0].init?.body as URLSearchParams);
      assert.equal(tokenBody.get('client_secret'), 'test-secret');
      assert.equal(tokenBody.get('code_verifier'), testCodeVerifier);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('does not make a provider request without server credentials', async () => {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  try {
    await assert.rejects(() => new FortyTwoProvider().exchangeCode('code', testCodeVerifier), {
      status: 503,
    });
  } finally {
    for (const key of envKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('rejects non-HTTPS avatar URLs and malformed provider identity', async () => {
  await withProviderEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 9,
      login: 'safe-login',
      image: { link: 'javascript:alert(1)' },
      campus_users: 'not-an-array',
      cursus_users: [{ cursus_id: 'invalid' }],
    }), { status: 200 })) as typeof fetch;
    try {
      const identity = await new FortyTwoProvider().fetchProfile('provider-token');
      assert.equal(identity.avatarUrl, null);
      assert.deepEqual(identity.campusMemberships, []);
      assert.deepEqual(identity.cursus, []);
      await assert.rejects(() => new FortyTwoProvider().fetchProfile(''), { status: 401 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
