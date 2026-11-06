import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export const OAUTH_ATTEMPT_TTL_MS = 5 * 60 * 1_000;
export const ALLOWED_RETURN_PATHS = new Set(['/', '/settings']);

export function hashOAuthValue(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface NewOAuthAttempt {
  state: string;
  browserNonce: string;
  codeVerifier: string;
  expiresAt: Date;
}

export interface ConsumedOAuthAttempt {
  id: string;
  returnPath: string;
  codeVerifier: string;
}

function deriveCodeVerifier(state: string, browserNonce: string): string {
  const clientSecret = process.env.FORTYTWO_CLIENT_SECRET;
  if (!clientSecret) throw new Error('42 sign-in is not configured');
  return createHmac('sha256', clientSecret)
    .update(`peer:42:pkce:v1\0${state}\0${browserNonce}`, 'utf8')
    .digest('base64url');
}

@Injectable()
export class OAuthAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(returnPath: string): Promise<NewOAuthAttempt> {
    const state = randomBytes(32).toString('base64url');
    const browserNonce = randomBytes(32).toString('base64url');
    const codeVerifier = deriveCodeVerifier(state, browserNonce);
    const expiresAt = new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS);
    await this.prisma.oAuthAttempt.create({
      data: {
        stateHash: hashOAuthValue(state),
        browserNonceHash: hashOAuthValue(browserNonce),
        returnPath: ALLOWED_RETURN_PATHS.has(returnPath) ? returnPath : '/',
        expiresAt,
      },
    });
    return { state, browserNonce, codeVerifier, expiresAt };
  }

  async consume(state: string, browserNonce: string): Promise<ConsumedOAuthAttempt | null> {
    if (!state || state.length > 256 || !browserNonce || browserNonce.length > 256) return null;
    const stateHash = hashOAuthValue(state);
    const browserNonceHash = hashOAuthValue(browserNonce);
    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.oAuthAttempt.updateMany({
        where: {
          provider: 'FORTYTWO',
          purpose: 'LOGIN',
          stateHash,
          browserNonceHash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
      const attempt = await transaction.oAuthAttempt.findFirst({
        where: { stateHash, consumedAt: now },
        select: { id: true, returnPath: true },
      });
      if (!attempt) return null;
      return {
        ...attempt,
        codeVerifier: deriveCodeVerifier(state, browserNonce),
      };
    });
  }
}
