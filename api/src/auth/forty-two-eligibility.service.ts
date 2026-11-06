import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { FortyTwoProfile } from './forty-two-provider';

@Injectable()
export class FortyTwoEligibilityService {
  eligibleCursusId(profile: FortyTwoProfile): number {
    const configured = process.env.FORTYTWO_ELIGIBLE_CURSUS_IDS
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!configured?.length) {
      throw new ServiceUnavailableException('42 student eligibility is not configured');
    }

    const ids = new Set<number>();
    for (const value of configured) {
      if (!/^\d+$/.test(value)) {
        throw new ServiceUnavailableException('42 student eligibility is not configured');
      }
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new ServiceUnavailableException('42 student eligibility is not configured');
      }
      ids.add(id);
    }

    const match = profile.cursus
      .map((cursus) => cursus.id)
      .filter((id) => ids.has(id))
      .sort((left, right) => left - right)[0];
    if (!match) throw new ForbiddenException('This 42 account is not eligible');
    return match;
  }
}
