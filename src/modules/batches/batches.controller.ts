import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { isStaffRole } from '../auth/auth.constants';
import { ApiScope } from '../auth/auth.constants';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';
import { RequireTenantFeatureGuard } from '../auth/guards/require-tenant-feature.guard';
import {
  AuthPrincipal,
  CurrentAuth,
  RequireScopes,
  RequireTenantFeature,
} from '../auth/auth.types';
import { Permission } from '../auth/permissions.constants';
import { RolePermissionService } from '../auth/role-permission.service';
import { TenantFeatureCode } from '../tenants/tenant-features.constants';
import { BatchIngestService } from './batch-ingest.service';
import { BatchesService } from './batches.service';
import {
  CompleteBatchUploadDto,
  RequestBatchUploadUrlDto,
} from './dto/batch-upload.dto';

@ApiTags('batches')
@ApiBearerAuth()
@Controller('batches')
export class BatchesController {
  constructor(
    private readonly batches: BatchesService,
    private readonly ingest: BatchIngestService,
    private readonly rolePermissions: RolePermissionService,
  ) {}

  @Get()
  @RequireScopes(ApiScope.BatchesRead)
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'tenant_id', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'per_page', required: false })
  async index(
    @CurrentAuth() auth: AuthPrincipal,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('tenant_id') filterTenantId?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    const staff = auth.typ === 'user' && !!auth.role && isStaffRole(auth.role);
    if (staff) {
      const ok = await this.rolePermissions.roleHas(
        auth.role!,
        Permission.BatchesView,
      );
      if (!ok) {
        throw new ForbiddenException('Insufficient permissions.');
      }
    }
    const parsedFilterTenant =
      filterTenantId != null && filterTenantId !== ''
        ? Number(filterTenantId)
        : null;
    const data = await this.batches.list({
      ownerUserId: auth.userId,
      tenantId: auth.tenantId,
      staff,
      // Customers cannot widen scope via tenant_id — only staff filters apply.
      filterTenantId:
        staff && parsedFilterTenant != null && Number.isFinite(parsedFilterTenant)
          ? parsedFilterTenant
          : null,
      status,
      search,
      dateFrom,
      dateTo,
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 15,
    });
    return { success: true, data };
  }

  @Post()
  @RequireScopes(ApiScope.BatchesWrite)
  @RequireTenantFeature(TenantFeatureCode.WebUpload)
  @UseGuards(ActiveSubscriptionGuard, RequireTenantFeatureGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { edi_file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('edi_file', {
      storage: memoryStorage(),
      limits: { fileSize: 10_485_760 },
    }),
  )
  async store(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.createFromUpload(file, auth, res, 'edi_file');
  }

  /** Nest alias — field name `file` (also accepts legacy `edi_file`). */
  @Post('ingest')
  @RequireScopes(ApiScope.BatchesWrite)
  @RequireTenantFeature(TenantFeatureCode.WebUpload)
  @UseGuards(ActiveSubscriptionGuard, RequireTenantFeatureGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10_485_760 },
    }),
  )
  async ingestAlias(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.createFromUpload(file, auth, res, 'file');
  }

  /**
   * TeleWound-style initiate: mint `edi/{tenantId}/{userId}/…` key + presigned PUT URL.
   * Browser uploads bytes directly to MinIO, then calls POST /batches/complete.
   */
  @Post('upload-url')
  @RequireScopes(ApiScope.BatchesWrite)
  @RequireTenantFeature(TenantFeatureCode.WebUpload)
  @UseGuards(ActiveSubscriptionGuard, RequireTenantFeatureGuard)
  async requestUploadUrl(
    @Body() body: RequestBatchUploadUrlDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const data = await this.ingest.requestUploadUrl({
      typ: auth.typ,
      role: auth.role,
      tenantId: auth.tenantId,
      userId: auth.userId,
      originalFilename: body.originalFilename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return { success: true, data };
  }

  /**
   * Finalize a presigned MinIO upload: HeadObject verify → validate/parse → BatchFile.
   */
  @Post('complete')
  @RequireScopes(ApiScope.BatchesWrite)
  @RequireTenantFeature(TenantFeatureCode.WebUpload)
  @UseGuards(ActiveSubscriptionGuard, RequireTenantFeatureGuard)
  async completeUpload(
    @Body() body: CompleteBatchUploadDto,
    @CurrentAuth() auth: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const parsed = await this.ingest.completeUploadFromObject({
        typ: auth.typ,
        role: auth.role,
        tenantId: auth.tenantId,
        userId: auth.userId,
        objectKey: body.objectKey,
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      });
      return this.respondAfterSuccessfulIngest(parsed, res);
    } catch (e) {
      return this.respondUploadFailure(e, res);
    }
  }

  /**
   * Stream raw EDI as text/plain (inline viewer).
   * Registered before `:id` sibling routes that don't conflict; path is more specific.
   */
  @Get(':id/edi/viewer')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(BatchOwnershipGuard)
  async viewer(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, downloadName } = await this.batches.getEdiViewerPayload(id);
    const safeName = downloadName.replace(/["\r\n]/g, '_');
    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }

  /** Short-lived presigned GET for the stored EDI object (ownership-checked). */
  @Get(':id/edi/download-url')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(BatchOwnershipGuard)
  async downloadUrl(@Param('id', ParseIntPipe) id: number) {
    const data = await this.batches.getEdiDownloadUrl(id);
    return { success: true, data };
  }

  @Get(':id')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(BatchOwnershipGuard)
  async show(@Param('id', ParseIntPipe) id: number) {
    const [batch, statistics] = await Promise.all([
      this.batches.getById(id),
      this.batches.getStatistics(id),
    ]);
    return { success: true, data: { batch, statistics } };
  }

  /** Lightweight poll for rule validation status. */
  @Get(':id/status')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(BatchOwnershipGuard)
  async status(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.batches.getStatusPoll(id);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return data;
  }

  @Get(':id/statistics')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(BatchOwnershipGuard)
  async statistics(@Param('id', ParseIntPipe) id: number) {
    const statistics = await this.batches.getStatistics(id);
    return { success: true, data: statistics };
  }

  @Delete(':id')
  @RequireScopes(ApiScope.BatchesWrite)
  @UseGuards(BatchOwnershipGuard)
  async destroy(@Param('id', ParseIntPipe) id: number) {
    await this.batches.delete(id);
    return { success: true, message: 'Batch deleted successfully.' };
  }

  @Post(':id/ingest')
  @RequireScopes(ApiScope.BatchesWrite)
  @RequireTenantFeature(TenantFeatureCode.WebUpload)
  @UseGuards(ActiveSubscriptionGuard, RequireTenantFeatureGuard, BatchOwnershipGuard)
  async ingestExisting(@Param('id', ParseIntPipe) id: number) {
    const batch = await this.ingest.ingest(id);
    return {
      success: true,
      data: {
        id: batch.id,
        status: batch.status,
        total_claims: batch.totalClaims,
        stage: batch.status === 'error' ? 'structural_error' : 'parsed',
        claim_validation_complete: false,
      },
    };
  }

  @Post(':id/process')
  @RequireScopes(ApiScope.Validate)
  @RequireTenantFeature(TenantFeatureCode.WebUpload)
  @UseGuards(ActiveSubscriptionGuard, RequireTenantFeatureGuard, BatchOwnershipGuard)
  async process(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { force?: boolean },
  ) {
    const batch = await this.ingest.process(id, Boolean(body?.force));
    return {
      success: true,
      data: {
        id: batch.id,
        status: batch.status,
        total_claims: batch.totalClaims,
        valid_claims: batch.validClaims,
        error_claims: batch.errorClaims,
        warning_claims: batch.warningClaims,
        stage: batch.status,
        claim_validation_complete: batch.status === 'validated',
      },
    };
  }

  private async createFromUpload(
    file: Express.Multer.File | undefined,
    auth: AuthPrincipal,
    res: Response,
    field: string,
  ) {
    if (!file) {
      throw new NotFoundException(`No ${field} uploaded.`);
    }
    try {
      const parsed = await this.ingest.ingestUpload(
        {
          originalname: file.originalname,
          buffer: file.buffer,
          size: file.size,
        },
        auth.userId,
        auth.tenantId,
      );
      return this.respondAfterSuccessfulIngest(parsed, res);
    } catch (e) {
      return this.respondUploadFailure(e, res);
    }
  }

  private async respondAfterSuccessfulIngest(
    parsed: Awaited<ReturnType<BatchIngestService['ingestUpload']>>,
    res: Response,
  ) {
    // Auto-start claim rules after parse.
    let batch = parsed;
    let validationQueued = false;
    let validationWarning: string | null = null;
    try {
      const started = await this.ingest.startRuleValidation(parsed.id, false);
      batch = started.batch;
      validationQueued = started.queued;
    } catch (validationError) {
      validationWarning =
        validationError instanceof Error
          ? validationError.message
          : 'Claim validation could not be started.';
    }

    res.status(201);
    const message = validationWarning
      ? `EDI syntax is valid. ${batch.totalClaims} claims parsed, but claim validation could not be started: ${validationWarning}`
      : validationQueued
        ? `EDI syntax is valid. ${batch.totalClaims} claims parsed. Rule validation is queued.`
        : `EDI syntax is valid. ${batch.totalClaims} claims parsed and rule validation is complete.`;

    return {
      success: true,
      message,
      data: {
        batch_id: batch.id,
        status: batch.status,
        edi_syntax: 'valid',
        original_filename: batch.originalFilename,
        total_claims: batch.totalClaims,
        validation_queued: validationQueued,
        validation_warning: validationWarning,
        claim_validation_complete: batch.status === 'validated',
        // Machine clients use method + endpoint; description stays non-instructional for any UI reuse.
        next_step: validationQueued
          ? {
              method: 'POST',
              endpoint: `/api/v1/batches/${batch.id}/validate`,
              description: 'Validation is running. Poll again when complete for results.',
            }
          : undefined,
      },
    };
  }

  private respondUploadFailure(e: unknown, res: Response) {
    if (e instanceof HttpException && e.getStatus() === 422) {
      const payload = e.getResponse();
      const obj =
        typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>)
          : { message: String(payload) };
      res.status(422);
      return {
        success: false,
        message: (obj.message as string) ?? 'EDI validation failed',
        data: {
          batch_id: null,
          status: 'error',
          edi_syntax: 'invalid',
          edi_validation_errors: obj.issues ?? obj,
        },
      };
    }
    throw e;
  }
}
