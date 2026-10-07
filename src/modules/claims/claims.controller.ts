import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { ClaimOwnershipGuard } from '../../common/guards/claim-ownership.guard';
import { ApiScope } from '../auth/auth.constants';
import { RequireScopes } from '../auth/auth.types';
import { ClaimsService } from './claims.service';

@ApiTags('claims')
@ApiBearerAuth()
@Controller()
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Get('batches/:id/claims')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(BatchOwnershipGuard)
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'payer', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'per_page', required: false })
  async index(
    @Param('id', ParseIntPipe) batchId: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('payer') payer?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    const data = await this.claims.listByBatch(batchId, {
      status,
      search,
      payer,
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 20,
    });
    return { success: true, data };
  }

  @Post('batches/:id/validate')
  @RequireScopes(ApiScope.Validate)
  @UseGuards(BatchOwnershipGuard)
  async validateBatch(
    @Param('id', ParseIntPipe) batchId: number,
    @Body() body: { force?: boolean | string | number },
    @Query('force') forceQuery?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const force =
      body?.force === true ||
      body?.force === 1 ||
      body?.force === '1' ||
      forceQuery === '1' ||
      forceQuery === 'true';
    const result = await this.claims.validateBatch(batchId, force);
    res?.status(result.httpStatus);
    return result.body;
  }

  @Get('claims/:id')
  @RequireScopes(ApiScope.BatchesRead)
  @UseGuards(ClaimOwnershipGuard)
  async show(@Param('id', ParseIntPipe) id: number) {
    const data = await this.claims.getById(id);
    return { success: true, data };
  }

  @Put('claims/:id')
  @RequireScopes(ApiScope.BatchesWrite)
  @UseGuards(ClaimOwnershipGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.claims.update(id, body);
    return {
      success: true,
      message: 'Claim updated successfully.',
      data,
    };
  }

  @Post('claims/:id/validate')
  @HttpCode(200)
  @RequireScopes(ApiScope.Validate)
  @UseGuards(ClaimOwnershipGuard)
  async validate(@Param('id', ParseIntPipe) id: number) {
    const data = await this.claims.validateClaim(id);
    return { success: true, data };
  }

  @Put('claims/:claimId/lines/:lineId')
  @RequireScopes(ApiScope.BatchesWrite)
  @UseGuards(ClaimOwnershipGuard)
  async updateLine(
    @Param('claimId', ParseIntPipe) claimId: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.claims.updateServiceLine(claimId, lineId, body);
    return {
      success: true,
      message: 'Service line updated successfully.',
      data,
    };
  }
}
