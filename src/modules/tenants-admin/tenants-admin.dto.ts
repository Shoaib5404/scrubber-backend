import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ALL_TENANT_FEATURES } from '../tenants/tenant-features.constants';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  subscription_status?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Subscription feature codes (defaults to all four).',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn([...ALL_TENANT_FEATURES], { each: true })
  features?: string[];

  @ApiPropertyOptional({ description: 'First tenant admin email (sends invite).' })
  @IsOptional()
  @IsEmail()
  admin_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  admin_name?: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended'] })
  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  subscription_status?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Replace subscription feature set.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn([...ALL_TENANT_FEATURES], { each: true })
  features?: string[];
}

export class InviteTenantUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ['tenant_admin', 'customer'] })
  @IsIn(['tenant_admin', 'customer'])
  role!: string;
}

export class ResendInviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class UpdateTenantUserDto {
  @ApiPropertyOptional({ enum: ['tenant_admin', 'customer'] })
  @IsOptional()
  @IsIn(['tenant_admin', 'customer'])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ListTenantsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  per_page?: number;
}
