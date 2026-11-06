import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { SessionsService, SESSION_TTL_MS } from './sessions.service';
import { PrismaService } from '../database/prisma.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

test('issues seven-day opaque session/CSRF values and persists only their hashes', async () => {
  const service = new SessionsService({} as PrismaService);
  const now = Date.now();
  const issued = service.issue(now);
  let inserted: Record<string, unknown> | undefined;
  const transaction = {
    session: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        inserted = data;
        return data;
      },
    },
  } as unknown as Prisma.TransactionClient;

  await service.persist(transaction, 'user-id', issued);
  assert.ok(issued.token.length >= 40);
  assert.ok(issued.csrfToken.length >= 40);
  assert.equal(issued.expiresAt.getTime(), now + SESSION_TTL_MS);
  assert.equal(inserted?.tokenHash, sha256(issued.token));
  assert.equal(inserted?.csrfTokenHash, sha256(issued.csrfToken));
  assert.notEqual(inserted?.tokenHash, issued.token);
  assert.notEqual(inserted?.csrfTokenHash, issued.csrfToken);
});

test('validates the session-bound CSRF token and rejects altered values', () => {
  const service = new SessionsService({} as PrismaService);
  const issued = service.issue();
  const row = { csrfTokenHash: sha256(issued.csrfToken) } as any;
  assert.equal(service.csrfIsValid(row, issued.csrfToken), true);
  assert.equal(service.csrfIsValid(row, `${issued.csrfToken}x`), false);
  assert.equal(service.csrfIsValid(row, null), false);
});
