import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isStaffRole } from '../auth/auth.constants';
import type { AuthPrincipal } from '../auth/auth.types';

export type ListUploadLogsQuery = {
  page?: number;
  per_page?: number;
  status?: string;
  error_type?: string;
  search?: string;
};

@Injectable()
export class UploadLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthPrincipal, query: ListUploadLogsQuery) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.per_page ?? 25, 100);
    const where: Prisma.EdiUploadErrorLogWhereInput = {};

    const staff = auth.typ === 'user' && auth.role && isStaffRole(auth.role);
    if (!staff) {
      if (auth.tenantId != null) {
        where.tenantId = auth.tenantId;
      } else {
        const ownerId = auth.userId;
        if (ownerId == null) {
          return {
            current_page: page,
            per_page: perPage,
            total: 0,
            last_page: 1,
            data: [],
            show_user_column: false,
          };
        }
        where.userId = ownerId;
      }
    }

    if (query.status?.trim()) {
      where.status = query.status.trim();
    }
    if (query.error_type?.trim()) {
      where.errorType = query.error_type.trim();
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { originalFilename: { contains: q, mode: 'insensitive' } },
        { errorMessage: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.ediUploadErrorLog.count({ where }),
      this.prisma.ediUploadErrorLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          batchFile: { select: { id: true, originalFilename: true, status: true } },
        },
        orderBy: { id: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      current_page: page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      show_user_column: Boolean(staff),
      data: rows.map((r) => ({
        id: r.id,
        user_id: r.userId,
        batch_file_id: r.batchFileId,
        failed_job_uuid: r.failedJobUuid,
        original_filename: r.originalFilename,
        file_size: r.fileSize,
        source: r.source,
        status: r.status,
        error_type: r.errorType,
        error_message: r.errorMessage,
        total_claims: r.totalClaims,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        user: r.user
          ? { id: r.user.id, name: r.user.name, email: r.user.email }
          : null,
        batch_file: r.batchFile
          ? {
              id: r.batchFile.id,
              original_filename: r.batchFile.originalFilename,
              status: r.batchFile.status,
            }
          : null,
      })),
    };
  }
}
