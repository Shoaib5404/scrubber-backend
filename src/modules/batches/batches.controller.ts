import { Controller, Get, NotFoundException, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { ApiScope } from '../auth/auth.constants';
import { RequireScopes } from '../auth/auth.types';

@ApiTags('batches')
@ApiBearerAuth()
@Controller('batches')
export class BatchesController {
  constructor(private readonly prisma: PrismaService) {}

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
    };
  }
}
