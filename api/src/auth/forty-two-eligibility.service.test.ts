import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { FortyTwoEligibilityService } from './forty-two-eligibility.service';

function withCursusIds<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.FORTYTWO_ELIGIBLE_CURSUS_IDS;
  if (value === undefined) delete process.env.FORTYTWO_ELIGIBLE_CURSUS_IDS;
  else process.env.FORTYTWO_ELIGIBLE_CURSUS_IDS = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.FORTYTWO_ELIGIBLE_CURSUS_IDS;
    else process.env.FORTYTWO_ELIGIBLE_CURSUS_IDS = previous;
  }
}

const profile = {
  fortyTwoId: '42',
  login: 'peer',
  displayName: 'Peer',
  avatarUrl: null,
  cursus: [{ id: 21, name: '42', level: 3 }],
  campusMemberships: [],
};

test('fails closed when no supported cursus IDs are configured', () => {
  withCursusIds(undefined, () => {
    assert.throws(() => new FortyTwoEligibilityService().eligibleCursusId(profile), { status: 503 });
  });
});

test('only accepts a configured cursus membership', () => {
  withCursusIds('21, 22', () => {
    assert.equal(new FortyTwoEligibilityService().eligibleCursusId(profile), 21);
    assert.throws(
      () => new FortyTwoEligibilityService().eligibleCursusId({ ...profile, cursus: [] }),
      { status: 403 },
    );
  });
});

test('rejects malformed eligibility configuration', () => {
  withCursusIds('21,not-an-id', () => {
    assert.throws(() => new FortyTwoEligibilityService().eligibleCursusId(profile), { status: 503 });
  });
});
