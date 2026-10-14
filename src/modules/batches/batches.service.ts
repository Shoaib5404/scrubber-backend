import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StorageService } from '../../adapters/storage/storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import {
  BatchStatistics,
  decimalToNumber,
  isoDate,
  lengthAwarePaginator,
  serializeBatch,
} from './api-serializers';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(params: {
    ownerUserId: number | null;
    tenantId: number | null;
    staff: boolean;
    /** Staff-only optional filter; ignored for non-staff. */
    filterTenantId?: number | null;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    perPage?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.min(100, Math.max(1, params.perPage ?? 15));
    const where: Prisma.BatchFileWhereInput = {};

    if (!params.staff) {
      if (params.tenantId != null) {
        where.tenantId = params.tenantId;
      } else if (params.ownerUserId != null) {
        // Legacy fallback while tenant_id is backfilled.
        where.uploadedById = params.ownerUserId;
      } else {
        return lengthAwarePaginator([], 0, page, perPage);
      }
    } else if (params.filterTenantId != null && params.filterTenantId > 0) {
      where.tenantId = params.filterTenantId;
    }

    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { originalFilename: { contains: params.search, mode: 'insensitive' } },
        { isaControlNumber: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(`${params.dateFrom}T00:00:00.000Z`);
      if (params.dateTo) where.createdAt.lte = new Date(`${params.dateTo}T23:59:59.999Z`);
    }

    const [total, rows] = await Promise.all([
      this.prisma.batchFile.count({ where }),
      this.prisma.batchFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          _count: { select: { claims: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return lengthAwarePaginator(
      rows.map((b) => serializeBatch(b)),
      total,
      page,
      perPage,
    );
  }

  async getById(id: number) {
    const batch = await this.prisma.batchFile.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        claims: {
          include: {
            _count: { select: { diagnoses: true, serviceLines: true } },
          },
        },
      },
    });
    if (!batch) throw new NotFoundException('Batch not found.');
    return serializeBatch({
      ...batch,
      _count: { claims: batch.claims.length },
    });
  }

  /** Lightweight poll payload for rule-validation status. */
  async getStatusPoll(id: number) {
    const batch = await this.prisma.batchFile.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        totalClaims: true,
        validClaims: true,
        errorClaims: true,
        warningClaims: true,
      },
    });
    if (!batch) throw new NotFoundException('Batch not found.');

    const pendingClaims = await this.prisma.claim.count({
      where: { batchFileId: id, status: 'pending' },
    });

    return {
      status: batch.status,
      label: batchStatusLabel(batch.status),
      total_claims: batch.totalClaims,
      valid_claims: batch.validClaims,
      error_claims: batch.errorClaims,
      warning_claims: batch.warningClaims,
      pending_claims: pendingClaims,
    };
  }

  async getStatistics(id: number): Promise<BatchStatistics> {
    const batch = await this.prisma.batchFile.findUnique({
      where: { id },
      include: {
        claims: {
          include: { serviceLines: { select: { serviceDateFrom: true } } },
        },
      },
    });
    if (!batch) throw new NotFoundException('Batch not found.');

    const claims = batch.claims;
    const pending = claims.filter((c) => c.status === 'pending').length;
    const valid = claims.filter((c) => c.status === 'valid').length;
    const warning = claims.filter((c) => c.status === 'warning').length;
    const error = claims.filter((c) => c.status === 'error').length;
    const dates = claims
      .flatMap((c) => c.serviceLines.map((l) => l.serviceDateFrom))
      .filter((d): d is Date => d != null)
      .map((d) => d.getTime());

    return {
      total_claims: claims.length,
      total_amount: claims.reduce((s, c) => s + decimalToNumber(c.totalCharge), 0),
      total_service_lines: claims.reduce((s, c) => s + c.serviceLines.length, 0),
      pending_claims: pending,
      valid_claims: valid,
      warning_claims: warning,
      error_claims: error,
      status_breakdown: { pending, valid, warning, error },
      unique_payers: [
        ...new Set(claims.map((c) => c.payerName).filter((v): v is string => Boolean(v))),
      ],
      unique_providers: [
        ...new Set(
          claims.map((c) => c.billingProviderName).filter((v): v is string => Boolean(v)),
        ),
      ],
      date_range: {
        earliest: dates.length ? isoDate(new Date(Math.min(...dates))) : null,
        latest: dates.length ? isoDate(new Date(Math.max(...dates))) : null,
      },
    };
  }

  async delete(id: number): Promise<void> {
    const batch = await this.prisma.batchFile.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Batch not found.');

    try {
      await this.storage.deleteObject(batch.filePath);
    } catch {
      // Object may already be gone.
    }

    await this.prisma.batchFile.delete({ where: { id } });
    this.audit.record({
      category: AuditCategoryCode.BatchDelete,
      action: 'deleted',
      tenantId: batch.tenantId,
      resourceType: 'batch',
      resourceId: id,
      metadata: { original_filename: batch.originalFilename },
    });
  }

  /** Raw uploaded EDI bytes for inline display. */
  async getEdiViewerPayload(id: number): Promise<{
    buffer: Buffer;
    downloadName: string;
  }> {
    const batch = await this.prisma.batchFile.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }
    if (!batch.filePath) {
      throw new NotFoundException('EDI file not found.');
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObject(batch.filePath);
    } catch {
      throw new NotFoundException('EDI file not found.');
    }

    const downloadName =
      batch.originalFilename || batch.filename || `batch-${batch.id}.edi`;
    return { buffer, downloadName };
  }

  /** Short-lived MinIO GET URL after ownership is confirmed by the guard. */
  async getEdiDownloadUrl(id: number): Promise<{ url: string; expiresIn: number }> {
    const batch = await this.prisma.batchFile.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }
    if (!batch.filePath) {
      throw new NotFoundException('EDI file not found.');
    }
    return this.storage.getPresignedDownloadUrl({ objectKey: batch.filePath });
  }
}

/** Human-readable batch status label. */
function batchStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'parsed':
      return 'Parsed';
    case 'validating':
      return 'Validating';
    case 'validated':
      return 'Validated';
    case 'exported':
      return 'Exported';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}
