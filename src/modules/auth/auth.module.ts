import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TenantFeaturesModule } from '../tenants/tenant-features.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ApiTokenController } from './api-token.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ActiveSubscriptionGuard } from './guards/active-subscription.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequirePermissionGuard } from './guards/require-permission.guard';
import { RequireTenantFeatureGuard } from './guards/require-tenant-feature.guard';
import { ScopesGuard } from './guards/scopes.guard';
import { SuperAdminOnlyGuard } from './guards/super-admin-only.guard';
import { EmailVerificationService } from './email-verification.service';
import { PasswordConfirmService } from './password-confirm.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { ProfileService } from './profile.service';
import { RolePermissionService } from './role-permission.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          issuer: config.get<string>('JWT_ISSUER', 'neo-scrubber'),
          audience: config.get<string>('JWT_AUDIENCE', 'neo-scrubber-api'),
        },
      }),
    }),
    TenantFeaturesModule,
    forwardRef(() => TenantsModule),
  ],
  controllers: [AuthController, ApiTokenController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    EmailVerificationService,
    PasswordConfirmService,
    ProfileService,
    RolePermissionService,
    JwtStrategy,
    ActiveSubscriptionGuard,
    RequireTenantFeatureGuard,
    RequirePermissionGuard,
    SuperAdminOnlyGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ScopesGuard },
  ],
  exports: [
    AuthService,
    PasswordService,
    PasswordConfirmService,
    RolePermissionService,
    ActiveSubscriptionGuard,
    RequireTenantFeatureGuard,
    RequirePermissionGuard,
    SuperAdminOnlyGuard,
    TenantFeaturesModule,
    JwtModule,
  ],
})
export class AuthModule {}
