import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;

@Injectable()
export class OAuthRateLimitService {
  private readonly requests = new Map<string, number[]>();

  consume(key: string, limit: number, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const cutoff = now - WINDOW_MS;
    const timestamps = (this.requests.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (timestamps.length >= limit) {
      this.requests.set(key, timestamps);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((timestamps[0] + WINDOW_MS - now) / 1_000)),
      };
    }
    timestamps.push(now);
    this.requests.delete(key);
    this.requests.set(key, timestamps);
    while (this.requests.size > MAX_KEYS) {
      const oldest = this.requests.keys().next().value;
      if (oldest === undefined) break;
      this.requests.delete(oldest);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

abstract class OAuthRateLimitGuard implements CanActivate {
  protected abstract readonly limit: number;
  protected abstract readonly keyPrefix: string;

  constructor(private readonly rateLimit: OAuthRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const address = request.ip || request.socket?.remoteAddress || 'unknown';
    const result = this.rateLimit.consume(`${this.keyPrefix}:${address}`, this.limit);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException('Too many authentication attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

@Injectable()
export class AuthStartRateLimitGuard extends OAuthRateLimitGuard {
  protected readonly limit = 10;
  protected readonly keyPrefix = 'oauth-start';

  constructor(rateLimit: OAuthRateLimitService) {
    super(rateLimit);
  }
}

@Injectable()
export class AuthCallbackRateLimitGuard extends OAuthRateLimitGuard {
  protected readonly limit = 30;
  protected readonly keyPrefix = 'oauth-callback';

  constructor(rateLimit: OAuthRateLimitService) {
    super(rateLimit);
  }
}
