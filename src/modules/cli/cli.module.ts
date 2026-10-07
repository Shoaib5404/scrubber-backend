import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnvFrom } from '../../config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { ImportsModule } from '../imports/imports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => loadEnvFrom(config),
    }),
    PrismaModule,
    LookupCacheModule,
    ImportsModule,
  ],
})
export class CliModule {}
