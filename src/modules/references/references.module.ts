import { Module } from '@nestjs/common';
import { CodingReferenceController } from './coding-reference/coding-reference.controller';
import { CodingReferenceService } from './coding-reference/coding-reference.service';
import { CptDetailsService } from './cpt/cpt-details.service';
import { CptExplorerController } from './cpt/cpt-explorer.controller';
import { Icd10CmBrowserController } from './icd10-cm/icd10-cm-browser.controller';
import { Icd10CmBrowserService } from './icd10-cm/icd10-cm-browser.service';

@Module({
  controllers: [CodingReferenceController, CptExplorerController, Icd10CmBrowserController],
  providers: [CodingReferenceService, CptDetailsService, Icd10CmBrowserService],
  exports: [CodingReferenceService, CptDetailsService, Icd10CmBrowserService],
})
export class ReferencesModule {}
