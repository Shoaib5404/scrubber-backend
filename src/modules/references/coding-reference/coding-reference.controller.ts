import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
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

  @Post('validate')
  @RequireScopes(ApiScope.ReferenceRead)
  async validate(
    @Body()
    body: {
      icd10?: string[];
      cpt?: string[];
      modifiers?: string[];
    },
  ) {
    for (const key of ['icd10', 'cpt', 'modifiers'] as const) {
      const list = body?.[key];
      if (list != null && list.length > 50) {
        throw new BadRequestException(`${key} may not contain more than 50 items.`);
      }
    }
    const data = await this.coding.validateBatch(body ?? {});
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
