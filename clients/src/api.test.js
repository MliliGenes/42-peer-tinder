import test from 'node:test';
import assert from 'node:assert/strict';
import { completeOnboarding, createIntention, loadIntentions, loadProjects, loadSession, logout, updateIntention } from './api.js';

test('loads the authenticated session without caching and keeps CSRF in memory', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify({
      authenticated: true,
      csrfToken: 'csrf-for-this-session',
      user: { login: 'peer', onboarded: false, visible: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const session = await loadSession();
    assert.equal(session.user.login, 'peer');
    assert.equal(calls[0].path, '/api/auth/session');
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sends onboarding consent and CSRF with same-origin credentials', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify({ onboarded: true, visible: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await completeOnboarding({ bio: 'Here to build.', visible: true });
    const call = calls[0];
    assert.equal(call.path, '/api/me/onboarding');
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.headers['x-csrf-token'], 'csrf-for-this-session');
    assert.deepEqual(JSON.parse(call.options.body), { bio: 'Here to build.', visible: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clears the in-memory CSRF token on unauthenticated session and logs out via protected POST', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_path, _options) => {
    calls += 1;
    return new Response(null, { status: calls === 1 ? 204 : 401 });
  };
  try {
    await logout();
    assert.equal(await loadSession(), null);
    await assert.rejects(() => completeOnboarding({ bio: '', visible: true }), /session needs to be refreshed/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loads private intentions and projects without caching, and protects writes with CSRF', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/auth/session') {
      return new Response(JSON.stringify({
        authenticated: true,
        csrfToken: 'csrf-intentions',
        user: { login: 'peer', onboarded: true, visible: true },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (path === '/api/me/intents') return Response.json({ intents: [] });
    if (path === '/api/projects') return Response.json({ projects: [] });
    if (options.method === 'PATCH') return Response.json({ intent: { id: 'intent-1' } });
    return Response.json({ intent: { id: 'intent-1' } });
  };
  try {
    await loadSession();
    assert.deepEqual(await loadIntentions(), []);
    assert.deepEqual(await loadProjects(), []);
    await createIntention({ purpose: 'DISCUSS', schedule: 'ANY', timeZone: 'UTC' });
    await updateIntention('intent-1', { active: false });
    assert.equal(calls[1].options.cache, 'no-store');
    assert.equal(calls[2].options.cache, 'no-store');
    assert.equal(calls[3].options.headers['x-csrf-token'], 'csrf-intentions');
    assert.deepEqual(JSON.parse(calls[3].options.body), { purpose: 'DISCUSS', schedule: 'ANY', timeZone: 'UTC' });
    assert.equal(calls[4].options.method, 'PATCH');
    assert.equal(calls[4].options.headers['x-csrf-token'], 'csrf-intentions');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
