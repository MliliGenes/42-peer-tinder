export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function appendCookies(response: any, cookies: string[]) {
  const existing = response.getHeader('Set-Cookie');
  const values = existing === undefined
    ? []
    : Array.isArray(existing)
      ? existing
      : [String(existing)];
  response.setHeader('Set-Cookie', [...values, ...cookies]);
}

export function cookieNames() {
  return process.env.NODE_ENV === 'production'
    ? { session: '__Host-peer_session', csrf: '__Host-peer_csrf', oauth: '__Host-peer_oauth_browser' }
    : { session: 'peer_session', csrf: 'peer_csrf', oauth: 'peer_oauth_browser' };
}

export function sessionCookieHeaders(token: string, csrfToken: string, maxAge: number) {
  const names = cookieNames();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `${names.session}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`,
    `${names.csrf}=${encodeURIComponent(csrfToken)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`,
  ];
}

export function clearSessionCookieHeaders() {
  const names = cookieNames();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `${names.session}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
    `${names.csrf}=; Max-Age=0; Path=/; SameSite=Lax${secure}`,
  ];
}

export function appOrigin(): URL {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error('APP_ORIGIN is not configured');
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_ORIGIN is invalid');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('APP_ORIGIN must use HTTPS in production');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('APP_ORIGIN is invalid');
  }
  return url;
}
