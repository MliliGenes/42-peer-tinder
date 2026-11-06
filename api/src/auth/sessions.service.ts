import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, Session, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface IssuedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export type AuthenticatedSession = Session & { user: User };

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  issue(now = Date.now()): IssuedSession {
    return {
      token: randomBytes(32).toString('base64url'),
      csrfToken: randomBytes(32).toString('base64url'),
      expiresAt: new Date(now + SESSION_TTL_MS),
    };
  }

  persist(transaction: Prisma.TransactionClient, userId: string, issued: IssuedSession) {
    return transaction.session.create({
      data: {
        userId,
        tokenHash: digest(issued.token),
        csrfTokenHash: digest(issued.csrfToken),
        expiresAt: issued.expiresAt,
      },
    });
  }

  async findValid(token: string | null): Promise<AuthenticatedSession | null> {
    if (!token || token.length > 256) return null;
    return this.prisma.session.findFirst({
      where: {
        tokenHash: digest(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          suspendedAt: null,
          deletionRequestedAt: null,
        },
      },
      include: { user: true },
    });
  }

  csrfIsValid(session: Session, token: string | null): boolean {
    if (!token || token.length > 256) return false;
    const actual = Buffer.from(digest(token), 'hex');
    const expected = Buffer.from(session.csrfTokenHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
