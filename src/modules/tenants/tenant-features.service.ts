import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import type { ApiScopeValue } from '../auth/auth.constants';
import {
  ALL_TENANT_FEATURES,
  isKnownTenantFeature,
  scopesForFeatures,
  type TenantFeatureCodeValue,
} from './tenant-features.constants';

@Injectable()
export class TenantFeaturesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AuditService))
    private readonly audit: AuditService,
  ) {}

  async has(tenantId: number, feature: string): Promise<boolean> {
    const row = await this.prisma.tenantFeature.findUnique({
      where: { tenantId_feature: { tenantId, feature } },
    });
    return Boolean(row?.enabled);
  }

  async list(tenantId: number): Promise<string[]> {
    const rows = await this.prisma.tenantFeature.findMany({
      where: { tenantId, enabled: true },
      select: { feature: true },
      orderBy: { feature: 'asc' },
    });
    return rows.map((r) => r.feature);
  }

  async allowedScopes(tenantId: number): Promise<ApiScopeValue[]> {
    const features = await this.list(tenantId);
    return scopesForFeatures(features);
  }

  /**
   * Replace the tenant's feature set. Unknown codes are rejected.
   * Empty array clears all features.
   */
  async replace(tenantId: number, features: string[]): Promise<string[]> {
    const normalized = this.validateFeatureList(features);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantFeature.deleteMany({ where: { tenantId } });
      if (normalized.length === 0) {
        return;
      }
      await tx.tenantFeature.createMany({
        data: normalized.map((feature) => ({
          tenantId,
          feature,
          enabled: true,
        })),
      });
    });

    this.audit.record({
      category: AuditCategoryCode.AdminTenantFeatures,
      action: 'updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      tenantId,
      metadata: { features: normalized },
    });

    return normalized;
  }

  /** Default on create: all four features (matches active-tenant backfill). */
  async enableDefaults(tenantId: number): Promise<string[]> {
    return this.replace(tenantId, [...ALL_TENANT_FEATURES]);
  }

  validateFeatureList(features: string[]): TenantFeatureCodeValue[] {
    if (!Array.isArray(features)) {
      throw new BadRequestException('features must be an array of feature codes.');
    }
    const unique = [...new Set(features.map((f) => String(f).trim()).filter(Boolean))];
    const unknown = unique.filter((f) => !isKnownTenantFeature(f));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown feature code(s): ${unknown.join(', ')}.`,
      );
    }
    return unique as TenantFeatureCodeValue[];
  }
}
