import { Module } from '@nestjs/common';
  import { Edi837ValidationService } from './edi837-validation.service';

  @Module({
    providers: [Edi837ValidationService],
    exports: [Edi837ValidationService],
  })
  export class EdiStructuralValidationModule {}
