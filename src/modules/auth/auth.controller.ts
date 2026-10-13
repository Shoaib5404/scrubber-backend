import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentAuth, Public, type AuthPrincipal } from './auth.types';
import {
  AcceptInviteDto,
  ConfirmPasswordDto,
  DeleteProfileDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  UpdatePasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { EmailVerificationService } from './email-verification.service';
import { PasswordConfirmService } from './password-confirm.service';
import { PasswordResetService } from './password-reset.service';
import { ProfileService } from './profile.service';
import { TenantInviteService } from '../tenants/tenant-invite.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly emailVerification: EmailVerificationService,
    private readonly passwordConfirm: PasswordConfirmService,
    private readonly profile: ProfileService,
    private readonly tenantInvites: TenantInviteService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    if (dto.password !== dto.password_confirmation) {
      throw new BadRequestException('password confirmation does not match');
    }
    return this.passwordReset.resetPassword({
      email: dto.email,
      token: dto.token,
      password: dto.password,
    });
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    if (dto.password !== dto.password_confirmation) {
      throw new BadRequestException('password confirmation does not match');
    }
    return this.tenantInvites.acceptInvite({
      email: dto.email,
      token: dto.token,
      password: dto.password,
    });
  }

  @Public()
  @Get('email/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmailGet(@Query() query: VerifyEmailDto) {
    return this.emailVerification.verifySignedLink({
      id: Number(query.id),
      hash: query.hash,
      expires: Number(query.expires),
      signature: query.signature,
    });
  }

  @Public()
  @Post('email/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmailPost(@Body() dto: VerifyEmailDto) {
    return this.emailVerification.verifySignedLink({
      id: Number(dto.id),
      hash: dto.hash,
      expires: Number(dto.expires),
      signature: dto.signature,
    });
  }

  @ApiBearerAuth()
  @Post('email/verification-notification')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  sendVerification(@CurrentAuth() auth: AuthPrincipal) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.emailVerification.sendVerificationNotification(auth.userId);
  }

  @ApiBearerAuth()
  @Post('confirm-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  confirmPassword(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() dto: ConfirmPasswordDto,
  ) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.passwordConfirm.confirm(auth.userId, dto.password);
  }

  @ApiBearerAuth()
  @Get('profile')
  getProfile(@CurrentAuth() auth: AuthPrincipal) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.profile.getProfile(auth.userId);
  }

  @ApiBearerAuth()
  @Patch('profile')
  updateProfile(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() dto: UpdateProfileDto,
  ) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.profile.updateProfile(auth.userId, dto.name);
  }

  @ApiBearerAuth()
  @Put('password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  updatePassword(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() dto: UpdatePasswordDto,
  ) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.profile.updatePassword(auth.userId, dto);
  }

  @ApiBearerAuth()
  @Delete('profile')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  deleteProfile(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() dto: DeleteProfileDto,
  ) {
    if (auth.typ !== 'user' || auth.userId == null) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return this.profile.deleteAccount(auth.userId, dto.password);
  }
}
