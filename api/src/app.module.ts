import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { FortyTwoProvider } from './auth/forty-two-provider';
import { FortyTwoAuthController } from './auth/forty-two-auth.controller';
import { OAuthAttemptsService } from './auth/oauth-attempts.service';
import { DatabaseModule } from './database/database.module';
import { FortyTwoEligibilityService } from './auth/forty-two-eligibility.service';
import { SessionsService } from './auth/sessions.service';
import { AuthSessionController } from './auth/auth-session.controller';
import { AuthCallbackRateLimitGuard, AuthStartRateLimitGuard, OAuthRateLimitService } from './auth/oauth-rate-limit.guard';
import { MeController } from './me/me.controller';
import { IntentsController } from './me/intents.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, FortyTwoAuthController, AuthSessionController, MeController, IntentsController],
  providers: [
    FortyTwoProvider,
    FortyTwoEligibilityService,
    OAuthAttemptsService,
    SessionsService,
    OAuthRateLimitService,
    AuthStartRateLimitGuard,
    AuthCallbackRateLimitGuard,
  ],
})
export class AppModule {}
