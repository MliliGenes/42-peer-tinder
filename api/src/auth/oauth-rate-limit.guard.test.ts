import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { OAuthRateLimitService } from './oauth-rate-limit.guard';

test('limits auth starts in a rolling window and returns retry timing', () => {
  const limiter = new OAuthRateLimitService();
  const now = 1_000_000;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(limiter.consume('ip:127.0.0.1', 10, now + attempt).allowed, true);
  }
  const blocked = limiter.consume('ip:127.0.0.1', 10, now + 10);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(limiter.consume('ip:127.0.0.2', 10, now + 10).allowed, true);
  assert.equal(limiter.consume('ip:127.0.0.1', 10, now + 60_001).allowed, true);
});
