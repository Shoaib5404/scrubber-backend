import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiScope } from '../../auth/auth.constants';
import { RequireScopes } from '../../auth/auth.types';
import {
  assertCptFound,
  CPT_TAB_KEYS,
  CptDetailsService,
  CptTabKey,
} from './cpt-details.service';

@ApiTags('cpt')
@ApiBearerAuth()
@Controller()
export class CptExplorerController {
  constructor(private readonly cptDetails: CptDetailsService) {}

  /** Laravel GET /api/cpt-search?code= */
  @Get('cpt-search')
  @RequireScopes(ApiScope.ReferenceRead)
  @ApiQuery({ name: 'code', required: true })
  async search(@Query('code') codeRaw?: string) {
    const raw = String(codeRaw ?? '').trim();
    if (!raw) throw new BadRequestException('Please enter a CPT code.');
    const code = this.cptDetails.normalizeCode(raw);
    if (!code) throw new BadRequestException('Please enter a valid CPT/HCPCS code.');
    const cpt = assertCptFound(await this.cptDetails.findCpt(code));
    return this.cptDetails.summary(cpt);
  }

  @Get('cpt/:code')
  @RequireScopes(ApiScope.ReferenceRead)
  async show(@Param('code') codeParam: string) {
    const code = this.cptDetails.normalizeCode(codeParam);
    if (!code) throw new BadRequestException('Invalid CPT code.');
    const cpt = assertCptFound(await this.cptDetails.findCpt(code));
    return this.cptDetails.summary(cpt);
  }

  @Get('cpt/:code/:tab')
  @RequireScopes(ApiScope.ReferenceRead)
  async tab(
    @Param('code') codeParam: string,
    @Param('tab') tab: string,
    @Query('page') pageRaw?: string,
    @Query('per_page') perPageRaw?: string,
    @Query('modifier') modifierRaw?: string,
    @Query('icd_code') icdCode?: string,
    @Query('modifier_code') modifierCode?: string,
  ) {
    const code = this.cptDetails.normalizeCode(codeParam);
    if (!code) throw new BadRequestException('Invalid CPT code.');
    assertCptFound(await this.cptDetails.findCpt(code));

    if (!(CPT_TAB_KEYS as readonly string[]).includes(tab)) {
      throw new NotFoundException('Unknown tab.');
    }

    const page = Math.max(1, Number(pageRaw ?? 1) || 1);
    const perPage = Math.min(100, Math.max(1, Number(perPageRaw ?? 25) || 25));

    let ncciModifier: number | null = null;
    if (tab === 'ncci' && modifierRaw != null && modifierRaw !== '') {
      const m = Number(modifierRaw);
      if (![0, 1, 9].includes(m)) {
        throw new BadRequestException('Invalid modifier filter.');
      }
      ncciModifier = m;
    }

    const payload = await this.cptDetails.tabPayload(tab as CptTabKey, code, page, perPage, {
      ncciModifier,
      ncdIcdCode: icdCode,
      cptModifierCode: modifierCode,
    });

    return { tab, code, ...payload };
  }
}
