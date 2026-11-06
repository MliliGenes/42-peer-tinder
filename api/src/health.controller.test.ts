import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { HealthController } from './health.controller';

test('health endpoint reports the API as ready', () => {
  assert.deepEqual(new HealthController().check(), {
    status: 'ok',
    service: 'peer-api',
  });
});
