import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthPrincipal, CurrentAuth } from '../auth/auth.types';
import { UploadLogsService } from './upload-logs.service';

class ListUploadLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  per_page?: number = 25;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  error_type?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

@ApiTags('upload-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload-logs')
export class UploadLogsController {
  constructor(private readonly uploadLogs: UploadLogsService) {}

  @Get()
  async index(@CurrentAuth() auth: AuthPrincipal, @Query() query: ListUploadLogsQueryDto) {
    return { success: true, data: await this.uploadLogs.list(auth, query) };
  }
}
