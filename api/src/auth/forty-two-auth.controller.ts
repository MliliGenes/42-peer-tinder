import { Controller, ForbiddenException, Get, HttpException, Query, Req, Res, UseGuards } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FortyTwoEligibilityService } from './forty-two-eligibility.service';
import { FortyTwoProvider } from './forty-two-provider';
import { OAuthAttemptsService } from './oauth-attempts.service';
import { SessionsService } from './sessions.service';
import { appOrigin, appendCookies, cookieNames, readCookie, sessionCookieHeaders } from './cookies';
import { AuthCallbackRateLimitGuard, AuthStartRateLimitGuard } from './oauth-rate-limit.guard';

function redirectAuthError(response: any, returnPath: string, code: string) {
  try {
    const destination = new URL(returnPath, appOrigin());
    destination.searchParams.set('auth_error', code);
    return response.redirect(destination.toString());
  } catch {
    return response.status(503).json({ error: '42 sign-in is unavailable' });
  }
}

@Controller('auth/42')
export class FortyTwoAuthController {
  constructor(
    private readonly attempts: OAuthAttemptsService,
    private readonly provider: FortyTwoProvider,
    private readonly eligibility: FortyTwoEligibilityService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  @Get()
  @UseGuards(AuthStartRateLimitGuard)
  async start(@Query('returnTo') returnTo: string | undefined, @Res() response: any) {
    try {
      const attempt = await this.attempts.create(returnTo ?? '/');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      const cookieName = cookieNames().oauth;
      response.setHeader(
        'Set-Cookie',
        `${cookieName}=${encodeURIComponent(attempt.browserNonce)}; Max-Age=300; Path=/; HttpOnly; SameSite=Lax${secure}`,
      );
      return response.redirect(this.provider.createAuthorizationUrl(attempt.state, attempt.codeVerifier));
    } catch {
      return redirectAuthError(response, '/', 'provider_unavailable');
    }
  }

  @Get('callback')
  @UseGuards(AuthCallbackRateLimitGuard)
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: any,
    @Res() response: any,
  ) {
    const production = process.env.NODE_ENV === 'production';
    const cookieName = cookieNames().oauth;
    const browserNonce = readCookie(request.headers?.cookie, cookieName);
    appendCookies(response, [
      `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}`,
    ]);

    if (typeof state !== 'string' || !browserNonce) {
      return response.status(401).json({ error: '42 authorization failed' });
    }
    const attempt = await this.attempts.consume(state, browserNonce);
    if (!attempt) {
      return response.status(401).json({ error: '42 authorization failed' });
    }
    if (providerError || typeof code !== 'string' || !code) {
      return redirectAuthError(response, attempt.returnPath, 'provider_denied');
    }

    try {
      const profile = await this.provider.verifyAuthorizationCode(code, attempt.codeVerifier);
      const eligibleCursusId = this.eligibility.eligibleCursusId(profile);
      const destination = new URL(attempt.returnPath, appOrigin());
      const issued = this.sessions.issue();
      await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          where: { fortyTwoId: profile.fortyTwoId },
          select: { suspendedAt: true, deletionRequestedAt: true },
        });
        if (existing?.suspendedAt || existing?.deletionRequestedAt) {
          throw new ForbiddenException('This account cannot sign in');
        }
        const user = await transaction.user.upsert({
          where: { fortyTwoId: profile.fortyTwoId },
          create: {
            fortyTwoId: profile.fortyTwoId,
            login: profile.login,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            eligibleCursusId,
          },
          update: {
            login: profile.login,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            eligibleCursusId,
          },
          select: { id: true },
        });
        await this.sessions.persist(transaction, user.id, issued);
      });

      appendCookies(response, sessionCookieHeaders(issued.token, issued.csrfToken, 7 * 24 * 60 * 60));
      return response.redirect(destination.toString());
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 503;
      const code = status === 403
        ? 'account_unavailable'
        : status === 401
          ? 'provider_rejected'
          : 'provider_unavailable';
      return redirectAuthError(response, attempt.returnPath, code);
    }
  }
}
