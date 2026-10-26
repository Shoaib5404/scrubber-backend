import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiScope } from '../../auth/auth.constants';
import { RequireScopes } from '../../auth/auth.types';
import {
  CodingReferenceService,
  requireFound,
} from './coding-reference.service';

@ApiTags('reference')
@ApiBearerAuth()
@Controller('reference')
export class CodingReferenceController {
  constructor(private readonly coding: CodingReferenceService) {}

  @Get('icd10/search')
  @RequireScopes(ApiScope.ReferenceRead)
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  async searchIcd10(@Query('q') q?: string, @Query('limit') limitRaw?: string) {
    const query = this.requireQuery(q);
    const limit = this.parseLimit(limitRaw);
    const items = await this.coding.searchIcd10(query, limit);
    return { success: true, data: { items, limit } };
  }

  @Get('icd10/:code')
  @RequireScopes(ApiScope.ReferenceRead)
  async showIcd10(@Param('code') code: string) {
    const item = requireFound(await this.coding.findIcd10(code), 'ICD-10 code not found.');
    return { success: true, data: item };
  }

  @Get('cpt/search')
  @RequireScopes(ApiScope.ReferenceRead)
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  async searchCpt(@Query('q') q?: string, @Query('limit') limitRaw?: string) {
    const query = this.requireQuery(q);
    const limit = this.parseLimit(limitRaw);
    const items = await this.coding.searchCpt(query, limit);
    return { success: true, data: { items, limit } };
  }

  @Get('cpt/:code')
  @RequireScopes(ApiScope.ReferenceRead)
  async showCpt(@Param('code') code: string) {
    const item = requireFound(await this.coding.findCpt(code), 'CPT code not found.');
    return { success: true, data: item };
  }

  @Get('modifiers/search')
  @RequireScopes(ApiScope.ReferenceRead)
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  async searchModifiers(@Query('q') q?: string, @Query('limit') limitRaw?: string) {
    const query = this.requireQuery(q);
    const limit = this.parseLimit(limitRaw);
    const items = await this.coding.searchModifiers(query, limit);
    return { success: true, data: { items, limit } };
  }

  @Get('modifiers/:code')
  @RequireScopes(ApiScope.ReferenceRead)
  async showModifier(@Param('code') code: string) {
    const item = requireFound(await this.coding.findModifier(code), 'Modifier not found.');
    return { success: true, data: item };
  }

  @Get('npi/search')
  @RequireScopes(ApiScope.ReferenceRead)
  @ApiOperation({
    summary: 'Search CMS Order & Referring NPIs',
    description:
      'Returns active rows from npi_ordering_referrings (CMS Order and Referring list), not full NPPES. Query by NPI digit prefix or last-name prefix (min 3 letters).',
  })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  async searchNpi(@Query('q') q?: string, @Query('limit') limitRaw?: string) {
    const query = this.requireQuery(q);
    const limit = this.parseLimit(limitRaw);
    const items = await this.coding.searchNpis(query, limit);
    return { success: true, data: { items, limit } };
  }

  @Get('npi/:npi')
  @RequireScopes(ApiScope.ReferenceRead)
  @ApiOperation({
    summary: 'Lookup CMS Order & Referring NPI',
    description:
      'Returns an active Order & Referring registry row. Not found / inactive → 404. formatValid is CMS NPI Luhn.',
  })
  async showNpi(@Param('npi') npi: string) {
    const item = requireFound(await this.coding.findNpi(npi), 'NPI not found.');
    return { success: true, data: item };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(ApiScope.ReferenceRead)
  @ApiOperation({
    summary: 'Batch-validate coding references and NPIs',
    description:
      'ICD10/CPT/modifiers: valid = found in reference DB. NPI: valid = active CMS Order & Referring row; formatValid = Luhn. Not full NPPES.',
  })
  async validate(
    @Body()
    body: {
      icd10?: string[];
      cpt?: string[];
      modifiers?: string[];
      npi?: string[];
    },
  ) {
    const payload = body ?? {};
    for (const key of ['icd10', 'cpt', 'modifiers', 'npi'] as const) {
      const list = payload[key];
      if (list != null && list.length > 50) {
        throw new BadRequestException(`${key} may not contain more than 50 items.`);
      }
    }
    const hasAny =
      (payload.icd10?.length ?? 0) > 0 ||
      (payload.cpt?.length ?? 0) > 0 ||
      (payload.modifiers?.length ?? 0) > 0 ||
      (payload.npi?.length ?? 0) > 0;
    if (!hasAny) {
      throw new BadRequestException('Provide at least one of icd10, cpt, modifiers, or npi.');
    }
    const data = await this.coding.validateBatch(payload);
    return { success: true, data };
  }

  private requireQuery(q?: string): string {
    const trimmed = String(q ?? '').trim();
    if (!trimmed || trimmed.length > 32) {
      throw new BadRequestException('Query parameter q is required (1–32 characters).');
    }
    return trimmed;
  }

  private parseLimit(limitRaw?: string): number {
    if (limitRaw == null || limitRaw === '') return this.coding.resolveLimit(null);
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > 25) {
      throw new BadRequestException('limit must be an integer between 1 and 25.');
    }
    return this.coding.resolveLimit(n);
  }
}
