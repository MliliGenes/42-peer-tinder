import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

const TOKEN_URL = 'https://api.intra.42.fr/oauth/token';
const PROFILE_URL = 'https://api.intra.42.fr/v2/me';
const REQUEST_TIMEOUT_MS = 5_000;

type JsonObject = Record<string, unknown>;

export interface FortyTwoProfile {
  fortyTwoId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  cursus: Array<{ id: number; name: string | null; level: number | null }>;
  campusMemberships: Array<{ id: number; name: string | null }>;
}

export interface FortyTwoCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function validCodeVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

function codeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}

function object(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function httpsUrl(value: unknown): string | null {
  const candidate = nonEmptyString(value);
  if (!candidate || candidate.length > 2_048) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function credentialsFromEnvironment(): FortyTwoCredentials {
  const clientId = process.env.FORTYTWO_CLIENT_ID?.trim();
  const clientSecret = process.env.FORTYTWO_CLIENT_SECRET;
  const redirectUri = process.env.FORTYTWO_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ServiceUnavailableException('42 sign-in is not configured');
  }

  let callback: URL;
  try {
    callback = new URL(redirectUri);
  } catch {
    throw new ServiceUnavailableException('42 sign-in is not configured');
  }
  const loopbackHost = ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
  if (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && loopbackHost)) {
    throw new ServiceUnavailableException('42 sign-in is not configured');
  }

  return { clientId, clientSecret, redirectUri: callback.toString() };
}

@Injectable()
export class FortyTwoProvider {
  createAuthorizationUrl(state: string, codeVerifier: string): string {
    if (!nonEmptyString(state) || state.length > 256 || !validCodeVerifier(codeVerifier)) {
      throw new UnauthorizedException('42 authorization failed');
    }
    const credentials = credentialsFromEnvironment();
    const url = new URL('https://api.intra.42.fr/oauth/authorize');
    url.searchParams.set('client_id', credentials.clientId);
    url.searchParams.set('redirect_uri', credentials.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'public');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    const authorizationCode = nonEmptyString(code);
    if (!authorizationCode || authorizationCode.length > 2_048 || !validCodeVerifier(codeVerifier)) {
      throw new UnauthorizedException('42 authorization failed');
    }

    const credentials = credentialsFromEnvironment();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code: authorizationCode,
      redirect_uri: credentials.redirectUri,
      code_verifier: codeVerifier,
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('42 sign-in provider is unavailable');
    }
    if (!response.ok) throw new UnauthorizedException('42 authorization failed');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UnauthorizedException('42 authorization failed');
    }
    const token = nonEmptyString(object(payload)?.access_token);
    if (!token || token.length > 8_192) {
      throw new UnauthorizedException('42 authorization failed');
    }
    return token;
  }

  async verifyAuthorizationCode(code: string, codeVerifier: string): Promise<FortyTwoProfile> {
    const accessToken = await this.exchangeCode(code, codeVerifier);
    return this.fetchProfile(accessToken);
  }

  async fetchProfile(accessToken: string): Promise<FortyTwoProfile> {
    if (!nonEmptyString(accessToken) || accessToken.length > 8_192) {
      throw new UnauthorizedException('42 authorization failed');
    }

    let response: Response;
    try {
      response = await fetch(PROFILE_URL, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('42 sign-in provider is unavailable');
    }
    if (!response.ok) throw new UnauthorizedException('42 authorization failed');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UnauthorizedException('42 authorization failed');
    }
    return this.mapProfile(payload);
  }

  private mapProfile(value: unknown): FortyTwoProfile {
    const profile = object(value);
    const id = positiveInteger(profile?.id);
    const login = nonEmptyString(profile?.login);
    if (!profile || !id || !login || login.length > 100) {
      throw new UnauthorizedException('42 identity response is invalid');
    }

    const image = object(profile.image);
    const cursus = Array.isArray(profile.cursus_users)
      ? profile.cursus_users.slice(0, 50).flatMap((entry) => {
          const cursusUser = object(entry);
          const cursusInfo = object(cursusUser?.cursus);
          const cursusId = positiveInteger(cursusUser?.cursus_id ?? cursusInfo?.id);
          if (!cursusUser || !cursusId) return [];
          const level = typeof cursusUser.level === 'number' && Number.isFinite(cursusUser.level)
            ? cursusUser.level
            : null;
          return [{
            id: cursusId,
            name: nonEmptyString(cursusInfo?.name),
            level,
          }];
        })
      : [];

    const campusMemberships = Array.isArray(profile.campus_users)
      ? profile.campus_users.slice(0, 50).flatMap((entry) => {
          const membership = object(entry);
          const campus = object(membership?.campus);
          const campusId = positiveInteger(membership?.campus_id ?? campus?.id);
          if (!membership || !campusId) return [];
          return [{ id: campusId, name: nonEmptyString(campus?.name) }];
        })
      : [];

    return {
      fortyTwoId: String(id),
      login,
      displayName: (nonEmptyString(profile.displayname) ?? login).slice(0, 200),
      avatarUrl: httpsUrl(image?.link),
      cursus,
      campusMemberships,
    };
  }
}
