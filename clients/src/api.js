let csrfToken = null;

async function responseError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Keep API errors generic if the server did not return JSON.
  }
  const message = typeof body?.error === 'string'
    ? body.error
    : typeof body?.message === 'string'
      ? body.message
      : 'The request could not be completed.';
  return new Error(message);
}

export async function loadSession() {
  const response = await fetch('/api/auth/session', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401) {
    csrfToken = null;
    return null;
  }
  if (!response.ok) throw await responseError(response);

  const session = await response.json();
  csrfToken = typeof session.csrfToken === 'string' ? session.csrfToken : null;
  if (!session.authenticated || !csrfToken || !session.user) {
    throw new Error('The session response was incomplete. Please try again.');
  }
  return session;
}

async function postJson(path, payload) {
  if (!csrfToken) throw new Error('Your session needs to be refreshed. Please try again.');
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response);
  return response.status === 204 ? null : response.json();
}

export function completeOnboarding({ bio, visible }) {
  return postJson('/api/me/onboarding', { bio, visible });
}

async function patchJson(path, payload) {
  if (!csrfToken) throw new Error('Your session needs to be refreshed. Please try again.');
  const response = await fetch(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function loadProfile() {
  const response = await fetch('/api/me', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401) throw new Error('Your session needs to be refreshed. Please try again.');
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function updateProfile(payload) {
  return patchJson('/api/me', payload);
}

async function getJson(path) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function loadIntentions() {
  const result = await getJson('/api/me/intents');
  return Array.isArray(result.intents) ? result.intents : [];
}

export async function loadProjects() {
  const result = await getJson('/api/projects');
  return Array.isArray(result.projects) ? result.projects : [];
}

export async function createIntention(payload) {
  return postJson('/api/me/intents', payload);
}

export async function updateIntention(id, payload) {
  return patchJson(`/api/me/intents/${encodeURIComponent(id)}`, payload);
}

export async function logout(allSessions = false) {
  const path = allSessions ? '/api/auth/logout-all' : '/api/auth/logout';
  await postJson(path, {});
  csrfToken = null;
}
