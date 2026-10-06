import { Module } from '@nestjs/common';
  import { ModelDrivenEdiParser } from './model-driven-edi.parser';

  @Module({
    providers: [ModelDrivenEdiParser],
    exports: [ModelDrivenEdiParser],
  })
  export class EdiParserModule {}
