import { Controller, Post, Req, Res } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { appOrigin, cookieNames, readCookie } from '../auth/cookies';
import { SessionsService } from '../auth/sessions.service';

@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('onboarding')
  async completeOnboarding(@Req() request: any, @Res() response: any) {
    response.setHeader('Cache-Control', 'private, no-store');
    const names = cookieNames();
    const token = readCookie(request.headers?.cookie, names.session);
    const session = await this.sessions.findValid(token);
    if (!session) return response.status(401).json({ error: 'unauthenticated' });

    let expectedOrigin: string;
    try {
      expectedOrigin = appOrigin().origin;
    } catch {
      return response.status(503).json({ error: 'onboarding is unavailable' });
    }
    const csrfCookie = readCookie(request.headers?.cookie, names.csrf);
    const csrfHeader = typeof request.headers?.['x-csrf-token'] === 'string'
      ? request.headers['x-csrf-token']
      : null;
    if (
      request.headers?.origin !== expectedOrigin ||
      !csrfHeader ||
      csrfHeader !== csrfCookie ||
      !this.sessions.csrfIsValid(session, csrfHeader)
    ) {
      return response.status(403).json({ error: 'request protection failed' });
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return response.status(400).json({ error: 'invalid onboarding data' });
    }
    if (Object.keys(body).some((key) => !['bio', 'visible'].includes(key))) {
      return response.status(400).json({ error: 'invalid onboarding data' });
    }
    if (typeof body.bio !== 'string' || body.bio.trim().length > 500 || body.visible !== true) {
      return response.status(400).json({ error: 'complete the profile and explicitly opt in to continue' });
    }

    const updated = await this.prisma.user.updateMany({
      where: {
        id: session.userId,
        onboardedAt: null,
        suspendedAt: null,
        deletionRequestedAt: null,
      },
      data: {
        bio: body.bio.trim(),
        visible: true,
        onboardedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      return response.status(409).json({ error: 'onboarding is already complete or unavailable' });
    }
    return response.status(200).json({ onboarded: true, visible: true, bio: body.bio.trim() });
  }
}
