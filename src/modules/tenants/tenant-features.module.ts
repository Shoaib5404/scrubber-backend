import { Module } from '@nestjs/common';
import { TenantFeaturesService } from './tenant-features.service';

/** Prisma-only feature entitlements — safe for CLI and HTTP (no AuthModule). */
@Module({
  providers: [TenantFeaturesService],
  exports: [TenantFeaturesService],
})
export class TenantFeaturesModule {}
