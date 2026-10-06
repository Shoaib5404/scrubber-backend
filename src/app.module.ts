import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { BatchesModule } from './modules/batches/batches.module';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './adapters/storage/storage.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { loadEnvFrom } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => loadEnvFrom(config),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    StorageModule,
    AuthModule,
    BatchesModule,
    HealthModule,
  ],
})
export class AppModule {}
