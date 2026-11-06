import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { appOrigin, appendCookies, clearSessionCookieHeaders, cookieNames, readCookie } from './cookies';
import { SessionsService } from './sessions.service';

@Controller('auth')
export class AuthSessionController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('session')
  async getSession(@Req() request: any, @Res() response: any) {
    response.setHeader('Cache-Control', 'private, no-store');
    const names = cookieNames();
    const token = readCookie(request.headers?.cookie, names.session);
    const session = await this.sessions.findValid(token);
    const csrfToken = readCookie(request.headers?.cookie, names.csrf);
    if (!session || !this.sessions.csrfIsValid(session, csrfToken)) {
      return response.status(401).json({ error: 'unauthenticated' });
    }
    return response.json({
      authenticated: true,
      csrfToken,
      user: {
        login: session.user.login,
        displayName: session.user.displayName,
        avatarUrl: session.user.avatarUrl,
        bio: session.user.bio,
        onboarded: session.user.onboardedAt !== null,
        visible: session.user.visible,
      },
    });
  }

  @Post('logout')
  async logout(@Req() request: any, @Res() response: any) {
    response.setHeader('Cache-Control', 'private, no-store');
    const session = await this.authorizeMutation(request, response);
    if (!session) return;
    await this.sessions.revokeSession(session.id);
    appendCookies(response, clearSessionCookieHeaders());
    return response.status(204).send();
  }

  @Post('logout-all')
  async logoutAll(@Req() request: any, @Res() response: any) {
    response.setHeader('Cache-Control', 'private, no-store');
    const session = await this.authorizeMutation(request, response);
    if (!session) return;
    await this.sessions.revokeAll(session.userId);
    appendCookies(response, clearSessionCookieHeaders());
    return response.status(204).send();
  }

  private async authorizeMutation(request: any, response: any) {
    const names = cookieNames();
    const token = readCookie(request.headers?.cookie, names.session);
    const session = await this.sessions.findValid(token);
    if (!session) {
      appendCookies(response, clearSessionCookieHeaders());
      response.status(401).json({ error: 'unauthenticated' });
      return null;
    }

    const csrfCookie = readCookie(request.headers?.cookie, names.csrf);
    const csrfHeader = typeof request.headers?.['x-csrf-token'] === 'string'
      ? request.headers['x-csrf-token']
      : null;
    let validOrigin = false;
    try {
      validOrigin = request.headers?.origin === appOrigin().origin;
    } catch {
      validOrigin = false;
    }

    if (!validOrigin || !csrfHeader || csrfHeader !== csrfCookie || !this.sessions.csrfIsValid(session, csrfHeader)) {
      response.status(403).json({ error: 'request protection failed' });
      return null;
    }
    return session;
  }
}
