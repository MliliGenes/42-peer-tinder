import { BadRequestException, Controller, ForbiddenException, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { appOrigin, cookieNames, readCookie } from '../auth/cookies';
import { AuthenticatedSession, SessionsService } from '../auth/sessions.service';

@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  @Get()
  async getProfile(@Req() request: any, @Res() response: any) {
    const session = await this.authorizeMutation(request, response, false);
    if (!session) return;
    return response.json(profileDto(session));
  }

  @Patch()
  async updateProfile(@Req() request: any, @Res() response: any) {
    const session = await this.authorizeMutation(request, response, true);
    if (!session) return;
    if (session.user.onboardedAt === null) {
      throw new ForbiddenException('complete onboarding before changing profile settings');
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('invalid profile settings');
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !['bio', 'visible'].includes(key))) {
      throw new BadRequestException('invalid profile settings');
    }
    if (keys.includes('bio') && (typeof body.bio !== 'string' || body.bio.trim().length > 500)) {
      throw new BadRequestException('bio must be 500 characters or fewer');
    }
    if (keys.includes('visible') && typeof body.visible !== 'boolean') {
      throw new BadRequestException('visible must be true or false');
    }

    const data: { bio?: string; visible?: boolean } = {};
    if (keys.includes('bio')) data.bio = (body.bio as string).trim();
    if (keys.includes('visible')) data.visible = body.visible as boolean;
    const updated = await this.prisma.user.updateMany({
      where: {
        id: session.userId,
        onboardedAt: { not: null },
        suspendedAt: null,
        deletionRequestedAt: null,
      },
      data,
    });
    if (updated.count !== 1) throw new ForbiddenException('profile settings are unavailable');
    const saved = await this.prisma.user.findUnique({ where: { id: session.userId }, select: { bio: true, visible: true } });
    if (!saved) throw new ForbiddenException('profile settings are unavailable');
    return response.json({ bio: saved.bio, visible: saved.visible });
  }

  @Post('onboarding')
  async completeOnboarding(@Req() request: any, @Res() response: any) {
    const session = await this.authorizeMutation(request, response, true);
    if (!session) return;

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

  private async authorizeMutation(request: any, response: any, mutation: boolean): Promise<AuthenticatedSession | null> {
    response.setHeader('Cache-Control', 'private, no-store');
    const token = readCookie(request.headers?.cookie, cookieNames().session);
    const session = await this.sessions.findValid(token);
    if (!session) {
      response.status(401).json({ error: 'unauthenticated' });
      return null;
    }
    if (!mutation) return session;

    let validOrigin = false;
    try {
      validOrigin = request.headers?.origin === appOrigin().origin;
    } catch {
      validOrigin = false;
    }
    const csrfCookie = readCookie(request.headers?.cookie, cookieNames().csrf);
    const csrfHeader = typeof request.headers?.['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : null;
    if (!validOrigin || !csrfHeader || csrfHeader !== csrfCookie || !this.sessions.csrfIsValid(session, csrfHeader)) {
      response.status(403).json({ error: 'request protection failed' });
      return null;
    }
    return session;
  }
}

function profileDto(session: AuthenticatedSession) {
  return {
    bio: session.user.bio,
    visible: session.user.visible,
    onboarded: session.user.onboardedAt !== null,
  };
}
