import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { OAuthAttemptsService, hashOAuthValue } from './oauth-attempts.service';
import { PrismaService } from '../database/prisma.service';

function fakePrisma() {
  let record: Record<string, any> | null = null;
  let consumed = false;
  const client = {
    oAuthAttempt: {
      create: async ({ data }: { data: Record<string, any> }) => {
        record = { id: 'attempt-id', provider: 'FORTYTWO', purpose: 'LOGIN', ...data };
        return record;
      },
    },
    $transaction: async (work: (transaction: any) => Promise<unknown>) => work({
      oAuthAttempt: {
        updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
          if (!record || consumed) return { count: 0 };
          if (record.stateHash !== where.stateHash || record.browserNonceHash !== where.browserNonceHash) return { count: 0 };
          if (record.provider !== where.provider || record.purpose !== where.purpose) return { count: 0 };
          if (record.expiresAt.getTime() <= where.expiresAt.gt.getTime()) return { count: 0 };
          consumed = true;
          record.consumedAt = data.consumedAt;
          return { count: 1 };
        },
        findFirst: async ({ where }: { where: Record<string, any> }) => {
          if (!record || record.stateHash !== where.stateHash || record.consumedAt !== where.consumedAt) return null;
          return { id: record.id, returnPath: record.returnPath };
        },
      },
    }),
  };
  return {
    prisma: client as unknown as PrismaService,
    getRecord: () => record,
  };
}

async function withClientSecret(run: () => Promise<void>) {
  const previous = process.env.FORTYTWO_CLIENT_SECRET;
  process.env.FORTYTWO_CLIENT_SECRET = 'test-pkce-client-secret';
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.FORTYTWO_CLIENT_SECRET;
    else process.env.FORTYTWO_CLIENT_SECRET = previous;
  }
}

test('creates high-entropy browser-bound attempts and stores only hashes', async () => {
  await withClientSecret(async () => {
    const fake = fakePrisma();
    const service = new OAuthAttemptsService(fake.prisma);
    const attempt = await service.create('/settings');
    const record = fake.getRecord()!;

    assert.ok(attempt.state.length >= 40);
    assert.ok(attempt.browserNonce.length >= 40);
    assert.match(attempt.codeVerifier, /^[A-Za-z0-9._~-]{43,128}$/);
    assert.equal('codeVerifier' in record, false);
    assert.notEqual(record.stateHash, attempt.state);
    assert.notEqual(record.browserNonceHash, attempt.browserNonce);
    assert.equal(record.stateHash, hashOAuthValue(attempt.state));
    assert.equal(record.returnPath, '/settings');
    assert.ok(attempt.expiresAt.getTime() > Date.now());
  });
});

test('rejects non-allowlisted return paths and consumes attempts once', async () => {
  await withClientSecret(async () => {
    const fake = fakePrisma();
    const service = new OAuthAttemptsService(fake.prisma);
    const attempt = await service.create('//attacker.invalid/');
    assert.equal(fake.getRecord()!.returnPath, '/');

    assert.equal(await service.consume(attempt.state, 'wrong-browser'), null);
    const results = await Promise.all([
      service.consume(attempt.state, attempt.browserNonce),
      service.consume(attempt.state, attempt.browserNonce),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.find(Boolean)?.codeVerifier, attempt.codeVerifier);
    assert.equal(await service.consume(attempt.state, attempt.browserNonce), null);
  });
});
