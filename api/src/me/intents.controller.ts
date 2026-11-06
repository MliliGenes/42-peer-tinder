import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { appOrigin, cookieNames, readCookie } from '../auth/cookies';
import { AuthenticatedSession, SessionsService } from '../auth/sessions.service';
import { PrismaService } from '../database/prisma.service';

const INTENT_TTL_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_ACTIVE_INTENTS = 3;
const PURPOSES = new Set(['JOIN_TEAM', 'RECRUIT_TEAM', 'DISCUSS']);
const SCHEDULES = new Set(['MORNING', 'EVENING', 'ANY']);
const intentInclude = { project: { select: { id: true, name: true, providerProjectId: true } } } as const;

type IntentInput = {
  purpose: string;
  projectName: string | null;
  schedule: string;
  timeZone: string;
  goal: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function parseIntentInput(body: unknown): IntentInput {
  if (!isRecord(body)) throw new BadRequestException('invalid intention');
  const allowed = new Set(['purpose', 'projectName', 'schedule', 'timeZone', 'goal']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new BadRequestException('invalid intention');

  const purpose = typeof body.purpose === 'string' ? body.purpose : '';
  if (!PURPOSES.has(purpose)) throw new BadRequestException('choose a supported intention');

  let projectName: string | null = null;
  if (body.projectName !== undefined && body.projectName !== null) {
    if (typeof body.projectName !== 'string' || body.projectName.trim().length > 100) {
      throw new BadRequestException('project name must be 100 characters or fewer');
    }
    projectName = body.projectName.trim() || null;
  }
  if (purpose !== 'DISCUSS' && !projectName) {
    throw new BadRequestException('a project is required for this intention');
  }
  if (projectName && !projectSlug(projectName)) {
    throw new BadRequestException('project name must contain letters or numbers');
  }

  const schedule = body.schedule === undefined ? 'ANY' : body.schedule;
  if (typeof schedule !== 'string' || !SCHEDULES.has(schedule)) {
    throw new BadRequestException('choose a supported schedule');
  }

  const timeZone = body.timeZone === undefined ? 'UTC' : body.timeZone;
  if (typeof timeZone !== 'string' || timeZone.length > 64) {
    throw new BadRequestException('provide a valid time zone');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new BadRequestException('provide a valid time zone');
  }

  let goal: string | null = null;
  if (body.goal !== undefined && body.goal !== null) {
    if (typeof body.goal !== 'string' || body.goal.trim().length > 240) {
      throw new BadRequestException('goal must be 240 characters or fewer');
    }
    goal = body.goal.trim() || null;
  }

  return { purpose, projectName, schedule, timeZone, goal };
}

function intentDto(intent: any) {
  return {
    id: intent.id,
    purpose: intent.purpose,
    project: intent.project
      ? { id: intent.project.id, name: intent.project.name, source: intent.project.providerProjectId ? '42' : 'self-reported' }
      : null,
    scopeKey: intent.scopeKey,
    active: intent.active,
    schedule: intent.schedule,
    timeZone: intent.timeZone,
    goal: intent.goal,
    confirmedAt: intent.confirmedAt,
    expiresAt: intent.expiresAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Controller()
export class IntentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  @Get('me/intents')
  async listIntents(@Req() request: any, @Res() response: any) {
    const session = await this.authorize(request, response, false);
    if (!session) return;
    const intents = await this.prisma.searchIntent.findMany({
      where: { userId: session.userId },
      include: intentInclude,
      orderBy: [{ active: 'desc' }, { expiresAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    return response.json({ intents: intents.map(intentDto) });
  }

  @Get('projects')
  async listProjects(@Req() request: any, @Res() response: any) {
    const session = await this.authorize(request, response, false);
    if (!session) return;
    const projects = await this.prisma.project.findMany({
      where: { enabled: true },
      select: { id: true, name: true, providerProjectId: true },
      orderBy: { name: 'asc' },
      take: 100,
    });
    return response.json({ projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      source: project.providerProjectId ? '42' : 'self-reported',
    })) });
  }

  @Post('me/intents')
  async createIntent(@Req() request: any, @Res() response: any) {
    const session = await this.authorize(request, response, true);
    if (!session) return;
    this.requireOnboarded(session);
    const input = parseIntentInput(request.body);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
    const slug = input.projectName ? projectSlug(input.projectName) : null;
    const scopeKey = slug ? `project:${slug}` : 'general';

    try {
      const intent = await this.prisma.$transaction(async (transaction) => {
        let project: { id: string; enabled: boolean } | null = null;
        if (slug && input.projectName) {
          project = await transaction.project.upsert({
            where: { slug },
            create: { slug, name: input.projectName },
            update: {},
            select: { id: true, enabled: true },
          });
          if (!project.enabled) throw new BadRequestException('that project is not available');
        }

        const existing = await transaction.searchIntent.findUnique({
          where: { userId_scopeKey_purpose: { userId: session.userId, scopeKey, purpose: input.purpose } },
          select: { id: true, active: true, expiresAt: true },
        });
        if (existing?.active && existing.expiresAt > now) {
          throw new ConflictException('you already have an active intention for this scope');
        }

        const activeCount = await transaction.searchIntent.count({
          where: { userId: session.userId, active: true, expiresAt: { gt: now }, ...(existing ? { id: { not: existing.id } } : {}) },
        });
        if (activeCount >= MAX_ACTIVE_INTENTS) throw new ConflictException('you can have up to three active intentions');

        const data = {
          projectId: project?.id ?? null,
          schedule: input.schedule,
          timeZone: input.timeZone,
          goal: input.goal,
          active: true,
          confirmedAt: now,
          expiresAt,
        };
        const saved = existing
          ? await transaction.searchIntent.update({ where: { id: existing.id }, data, include: intentInclude })
          : await transaction.searchIntent.create({
            data: {
              userId: session.userId,
              projectId: project?.id ?? null,
              scopeKey,
              purpose: input.purpose,
              schedule: input.schedule,
              timeZone: input.timeZone,
              goal: input.goal,
              active: true,
              confirmedAt: now,
              expiresAt,
            },
            include: intentInclude,
          });
        return saved;
      });
      return response.status(200).json({ intent: intentDto(intent) });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException('an intention for this scope already exists');
      throw error;
    }
  }

  @Patch('me/intents/:id')
  async updateIntent(@Param('id') id: string, @Req() request: any, @Res() response: any) {
    const session = await this.authorize(request, response, true);
    if (!session) return;
    this.requireOnboarded(session);
    if (!id || id.length > 100) throw new BadRequestException('invalid intention');
    const body = request.body;
    if (!isRecord(body) || Object.keys(body).length !== 1) throw new BadRequestException('invalid intention update');

    const current = await this.prisma.searchIntent.findFirst({ where: { id, userId: session.userId } });
    if (!current) throw new NotFoundException('intention not found');
    const now = new Date();
    if (body.active === false) {
      const updated = await this.prisma.searchIntent.update({
        where: { id },
        data: { active: false },
        include: intentInclude,
      });
      return response.json({ intent: intentDto(updated) });
    }
    if (body.renew !== true) throw new BadRequestException('pause with active=false or renew explicitly');

    const activeCount = await this.prisma.searchIntent.count({
      where: { userId: session.userId, active: true, expiresAt: { gt: now }, id: { not: id } },
    });
    if (activeCount >= MAX_ACTIVE_INTENTS) throw new ConflictException('you can have up to three active intentions');
    const updated = await this.prisma.searchIntent.update({
      where: { id },
      data: { active: true, confirmedAt: now, expiresAt: new Date(now.getTime() + INTENT_TTL_MS) },
      include: intentInclude,
    });
    return response.json({ intent: intentDto(updated) });
  }

  private async authorize(request: any, response: any, mutation: boolean): Promise<AuthenticatedSession | null> {
    response.setHeader('Cache-Control', 'private, no-store');
    const token = readCookie(request.headers?.cookie, cookieNames().session);
    const session = await this.sessions.findValid(token);
    if (!session) {
      response.status(401).json({ error: 'unauthenticated' });
      return null;
    }
    if (!mutation) return session;

    let originIsValid = false;
    try {
      originIsValid = request.headers?.origin === appOrigin().origin;
    } catch {
      originIsValid = false;
    }
    const csrfCookie = readCookie(request.headers?.cookie, cookieNames().csrf);
    const csrfHeader = typeof request.headers?.['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : null;
    if (!originIsValid || !csrfHeader || csrfHeader !== csrfCookie || !this.sessions.csrfIsValid(session, csrfHeader)) {
      response.status(403).json({ error: 'request protection failed' });
      return null;
    }
    return session;
  }

  private requireOnboarded(session: AuthenticatedSession): void {
    if (!session.user.onboardedAt) throw new ForbiddenException('complete onboarding before managing intentions');
  }
}
