import { Module } from '@nestjs/common';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { InitialTreatmentCodesImportCommand } from './initial-treatment-codes.command';
import { InitialTreatmentCodesImportService } from './initial-treatment-codes.import.service';
import { LookupSyncHelper } from './lookup-sync.helper';
import { MajorSurgeryCodesImportCommand } from './major-surgery-codes.command';
import { MajorSurgeryCodesImportService } from './major-surgery-codes.import.service';
import { NoOfUnitsCptsImportCommand } from './no-of-units-cpts.command';
import { NoOfUnitsCptsImportService } from './no-of-units-cpts.import.service';
import { RadiologyCptCodesImportCommand } from './radiology-cpt-codes.command';
import { RadiologyCptCodesImportService } from './radiology-cpt-codes.import.service';

@Module({
  imports: [PrismaModule, LookupCacheModule],
  providers: [
    LookupSyncHelper,
    RadiologyCptCodesImportService,
    MajorSurgeryCodesImportService,
    InitialTreatmentCodesImportService,
    NoOfUnitsCptsImportService,
    RadiologyCptCodesImportCommand,
    MajorSurgeryCodesImportCommand,
    InitialTreatmentCodesImportCommand,
    NoOfUnitsCptsImportCommand,
  ],
  exports: [
    RadiologyCptCodesImportService,
    MajorSurgeryCodesImportService,
    InitialTreatmentCodesImportService,
    NoOfUnitsCptsImportService,
  ],
})
export class ImportsModule {}
