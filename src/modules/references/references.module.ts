import { Module } from '@nestjs/common';
import { CodingReferenceController } from './coding-reference/coding-reference.controller';
import { CodingReferenceService } from './coding-reference/coding-reference.service';
import { CptDetailsService } from './cpt/cpt-details.service';
import { CptExplorerController } from './cpt/cpt-explorer.controller';

@Module({
  controllers: [CodingReferenceController, CptExplorerController],
  providers: [CodingReferenceService, CptDetailsService],
  exports: [CodingReferenceService, CptDetailsService],
})
export class ReferencesModule {}
