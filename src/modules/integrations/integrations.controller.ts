import { Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentAuth, type AuthPrincipal } from '../auth/auth.types';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('settings/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  show(@CurrentAuth() auth: AuthPrincipal) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.integrations.show(auth.userId).then((data) => ({
      success: true,
      data,
    }));
  }

  @Post('create')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentAuth() auth: AuthPrincipal) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.integrations.createCredentials(auth.userId).then((data) => ({
      success: true,
      message: data.message,
      data: {
        api_client: data.api_client,
        plain_client_secret: data.plain_client_secret,
      },
    }));
  }

  @Post('rotate-secret')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  rotateSecret(@CurrentAuth() auth: AuthPrincipal) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.integrations.rotateSecret(auth.userId).then((data) => ({
      success: true,
      message: data.message,
      data: {
        api_client: data.api_client,
        plain_client_secret: data.plain_client_secret,
      },
    }));
  }
}
