import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isStaffRole } from '../auth/auth.constants';
import type { AuthPrincipal } from '../auth/auth.types';

const INVALID_FORMAT_MESSAGE = 'EDI file is not in a correct format.';
const INVALID_FILE_MESSAGE = 'The uploaded file was rejected before it could be saved.';
const STORAGE_MESSAGE = 'The uploaded file could not be read from storage.';
const UNEXPECTED_MESSAGE = 'The upload could not be completed.';

export type UploadLogSource = 'web' | 'api' | 'cli';

export type RecordUploadFailureInput = {
  userId: number;
  tenantId: number | null;
  batchFileId?: number | null;
  originalFilename?: string | null;
  fileSize?: number | null;
  source: UploadLogSource;
  errorType: string;
  errorMessage: string;
};

/**
 * Map an ingest exception to a short, non-PHI log row.
 * Structural issue lists stay on the upload response and are not stored.
 * Auth failures (401/403) are not upload problems and return null.
 */
export function classifyUploadFailure(
  err: unknown,
): { errorType: string; errorMessage: string } | null {
  if (err instanceof HttpException) {
    const status = err.getStatus();
    if (status === 422) {
      return { errorType: 'invalid_format', errorMessage: INVALID_FORMAT_MESSAGE };
    }
    if (status === 400) {
      const payload = err.getResponse();
      const raw =
        typeof payload === 'string'
          ? payload
          : typeof payload === 'object' &&
              payload !== null &&
              'message' in payload &&
              typeof (payload as { message?: unknown }).message === 'string'
            ? (payload as { message: string }).message
            : '';
      if (/storage|not found/i.test(raw)) {
        return { errorType: 'storage', errorMessage: STORAGE_MESSAGE };
      }
      return { errorType: 'invalid_file', errorMessage: INVALID_FILE_MESSAGE };
    }
    return null;
  }
  return { errorType: 'unexpected', errorMessage: UNEXPECTED_MESSAGE };
}

export type ListUploadLogsQuery = {
  page?: number;
  per_page?: number;
  status?: string;
  error_type?: string;
  search?: string;
};

@Injectable()
export class UploadLogsService {
  private readonly logger = new Logger(UploadLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a failed upload that did not become a reviewable batch.
   * Never throws — a logging failure must not change the upload response.
   */
  async recordFailure(input: RecordUploadFailureInput): Promise<void> {
    if (!Number.isInteger(input.userId) || input.userId <= 0) return;
    try {
      await this.prisma.ediUploadErrorLog.create({
        data: {
          userId: input.userId,
          tenantId: input.tenantId,
          batchFileId: input.batchFileId ?? null,
          originalFilename: input.originalFilename ?? null,
          fileSize: input.fileSize ?? null,
          source: input.source,
          status: 'failed',
          errorType: input.errorType,
          errorMessage: input.errorMessage.slice(0, 2000),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write upload error log (${input.errorType}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async recordFromError(
    err: unknown,
    context: Omit<RecordUploadFailureInput, 'errorType' | 'errorMessage'>,
  ): Promise<void> {
    const classified = classifyUploadFailure(err);
    if (!classified) return;
    await this.recordFailure({ ...context, ...classified });
  }

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
