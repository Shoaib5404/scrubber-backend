import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './auth.types';
import { IssueApiTokenDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class ApiTokenController {
  constructor(private readonly auth: AuthService) {}

  /** Laravel parity: POST /api/v1/auth/token */
  @Public()
  @Post('token')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  issue(@Body() dto: IssueApiTokenDto) {
    return this.auth.issueApiClientToken(dto.client_id, dto.client_secret);
  }
}
