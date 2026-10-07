import {
  Body,
  Controller,
  Delete,
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
import { AuthPrincipal, CurrentAuth, RequireScopes } from '../auth/auth.types';
import { BatchIngestService } from './batch-ingest.service';
import { BatchesService } from './batches.service';

@ApiTags('batches')
@ApiBearerAuth()
@Controller('batches')
export class BatchesController {
  constructor(
    private readonly batches: BatchesService,
    private readonly ingest: BatchIngestService,
  ) {}

  @Get()
  @RequireScopes(ApiScope.BatchesRead)
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'per_page', required: false })
  async index(
    @CurrentAuth() auth: AuthPrincipal,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    const staff = auth.typ === 'user' && !!auth.role && isStaffRole(auth.role);
    const data = await this.batches.list({
      ownerUserId: auth.userId,
      staff,
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
      limits: { fileSize: 26_214_400 },
    }),
  )
  async store(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.createFromUpload(file, auth, res, 'edi_file');
  }

  /** Nest alias — field name `file` instead of Laravel `edi_file`. */
  @Post('ingest')
  @RequireScopes(ApiScope.BatchesWrite)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 26_214_400 },
    }),
  )
  async ingestAlias(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.createFromUpload(file, auth, res, 'file');
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
  @UseGuards(BatchOwnershipGuard)
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
  @UseGuards(BatchOwnershipGuard)
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
      const batch = await this.ingest.ingestUpload(
        {
          originalname: file.originalname,
          buffer: file.buffer,
          size: file.size,
        },
        auth.userId,
      );
      res.status(201);
      return {
        success: true,
        message:
          'EDI file is correct and syntax is valid. Your file is under process for rule validation.',
        data: {
          batch_id: batch.id,
          status: batch.status,
          edi_syntax: 'valid',
          original_filename: batch.originalFilename,
          total_claims: batch.totalClaims,
          next_step: {
            method: 'POST',
            endpoint: `/api/v1/batches/${batch.id}/validate`,
            description:
              'Call this endpoint to start rule validation, then call it again to get results when complete.',
          },
        },
      };
    } catch (e) {
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
}
