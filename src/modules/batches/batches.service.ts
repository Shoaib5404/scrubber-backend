import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BatchStatistics,
  decimalToNumber,
  isoDate,
  laravelPaginator,
  serializeBatch,
} from './api-serializers';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(params: {
    ownerUserId: number | null;
    staff: boolean;
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
      if (params.ownerUserId == null) {
        return laravelPaginator([], 0, page, perPage);
      }
      where.uploadedById = params.ownerUserId;
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
        include: { _count: { select: { claims: true } } },
      }),
    ]);

    return laravelPaginator(
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

    const abs = path.resolve(
      this.config.get<string>('EDI_LOCAL_PATH', './storage/edi'),
      batch.filePath,
    );
    try {
      await fsp.unlink(abs);
    } catch {
      // File may already be gone.
    }

    await this.prisma.batchFile.delete({ where: { id } });
  }
}
