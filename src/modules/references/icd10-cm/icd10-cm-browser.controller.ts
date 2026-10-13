import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiScope } from '../../auth/auth.constants';
import { RequireScopes } from '../../auth/auth.types';
import { Icd10CmBrowserService } from './icd10-cm-browser.service';

@ApiTags('icd10-cm')
@ApiBearerAuth()
@Controller('icd10-cm')
export class Icd10CmBrowserController {
  constructor(private readonly browser: Icd10CmBrowserService) {}

  @Get('chapters')
  @RequireScopes(ApiScope.ReferenceRead)
  listChapters() {
    return this.browser.listChapters();
  }

  @Get('chapters/:chapterCode')
  @RequireScopes(ApiScope.ReferenceRead)
  getChapter(@Param('chapterCode') chapterCode: string) {
    return this.browser.getChapter(decodeURIComponent(chapterCode));
  }

  @Get('chapters/:chapterCode/sections/:sectionCode')
  @RequireScopes(ApiScope.ReferenceRead)
  getSection(
    @Param('chapterCode') chapterCode: string,
    @Param('sectionCode') sectionCode: string,
  ) {
    return this.browser.getSection(
      decodeURIComponent(chapterCode),
      decodeURIComponent(sectionCode),
    );
  }

  @Get('chapters/:chapterCode/sections/:sectionCode/codes/:code')
  @RequireScopes(ApiScope.ReferenceRead)
  getCode(
    @Param('chapterCode') chapterCode: string,
    @Param('sectionCode') sectionCode: string,
    @Param('code') code: string,
  ) {
    return this.browser.getCode(
      decodeURIComponent(chapterCode),
      decodeURIComponent(sectionCode),
      decodeURIComponent(code),
    );
  }

  @Get('chapters/:chapterCode/sections/:sectionCode/codes/:code/children/:childCode')
  @RequireScopes(ApiScope.ReferenceRead)
  getChildCode(
    @Param('chapterCode') chapterCode: string,
    @Param('sectionCode') sectionCode: string,
    @Param('code') code: string,
    @Param('childCode') childCode: string,
  ) {
    return this.browser.getChildCode(
      decodeURIComponent(chapterCode),
      decodeURIComponent(sectionCode),
      decodeURIComponent(code),
      decodeURIComponent(childCode),
    );
  }
}
