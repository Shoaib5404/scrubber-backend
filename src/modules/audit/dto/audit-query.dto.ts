import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAuditEventsQueryDto {
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
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  action?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tenant_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actor_user_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource_id?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class PatchAuditCategoryDto {
  @IsBoolean()
  enabled!: boolean;
}
