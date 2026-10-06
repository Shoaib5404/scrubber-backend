import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { ApiScope } from '../auth/auth.constants';
import { AuthPrincipal, CurrentAuth, RequireScopes } from '../auth/auth.types';
import { ClaimValidationService } from '../claim-validation/claim-validation.service';
import { BatchIngestService } from './batch-ingest.service';

@ApiTags('batches')
@ApiBearerAuth()
@Controller('batches')
export class BatchesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: BatchIngestService,
    private readonly claimValidation: ClaimValidationService,
  ) {}

  @Post('ingest')
  @RequireScopes(ApiScope.BatchesWrite)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 26_214_400 },
    }),
  )
  async ingestUpload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    if (!file) {
      throw new NotFoundException('No file uploaded.');
    }
    const batch = await this.ingest.ingestUpload(
      {
        originalname: file.originalname,
        buffer: file.buffer,
        size: file.size,
      },
      auth.userId,
    );
    return {
      id: batch.id,
      status: batch.status,
      totalClaims: batch.totalClaims,
      stage: 'parsed',
      claimValidationComplete: false,
    };
  }

  @Post(':id/ingest')
  @RequireScopes(ApiScope.BatchesWrite)
  @UseGuards(BatchOwnershipGuard)
  async ingestExisting(@Param('id', ParseIntPipe) id: number) {
    const batch = await this.ingest.ingest(id);
    return {
      id: batch.id,
      status: batch.status,
      totalClaims: batch.totalClaims,
      stage: batch.status === 'error' ? 'structural_error' : 'parsed',
      claimValidationComplete: false,
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
      id: batch.id,
      status: batch.status,
      totalClaims: batch.totalClaims,
      validClaims: batch.validClaims,
      errorClaims: batch.errorClaims,
      warningClaims: batch.warningClaims,
      stage: batch.status,
      claimValidationComplete: batch.status === 'validated',
    };
  }

  @Get(':id')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(BatchOwnershipGuard)
  async show(@Param('id', ParseIntPipe) id: number) {
    const batch = await this.prisma.batchFile.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }
    return {
      id: batch.id,
      filename: batch.filename,
      originalFilename: batch.originalFilename,
      status: batch.status,
      uploadedById: batch.uploadedById,
      totalClaims: batch.totalClaims,
      validClaims: batch.validClaims,
      errorClaims: batch.errorClaims,
      warningClaims: batch.warningClaims,
      ediValidationErrors: batch.ediValidationErrors,
      claimValidationComplete: batch.status === 'validated',
    };
  }
}

@ApiTags('claims')
@ApiBearerAuth()
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimValidation: ClaimValidationService) {}

  @Post(':id/validate')
  @RequireScopes(ApiScope.Validate)
  async validate(@Param('id', ParseIntPipe) id: number) {
    return this.claimValidation.validateClaim(id);
  }
}
