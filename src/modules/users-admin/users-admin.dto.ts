import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const ASSIGNABLE_ROLES = ['admin', 'user', 'customer'] as const;
const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'expired', 'cancelled'] as const;

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  per_page?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateUserDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(ASSIGNABLE_ROLES)
  role!: string;

  @IsBoolean()
  is_active!: boolean;

  @IsOptional()
  @IsString()
  plan?: string | null;

  @ValidateIf((o: CreateUserDto) => o.role === 'customer')
  @IsIn(SUBSCRIPTION_STATUSES)
  subscription_status!: string;

  @IsOptional()
  @IsString()
  subscription_starts_at?: string | null;

  @IsOptional()
  @IsString()
  subscription_ends_at?: string | null;
}

export class UpdateUserDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsIn(ASSIGNABLE_ROLES)
  role!: string;

  @IsBoolean()
  is_active!: boolean;

  @IsOptional()
  @IsString()
  plan?: string | null;

  @ValidateIf((o: UpdateUserDto) => o.role === 'customer')
  @IsIn(SUBSCRIPTION_STATUSES)
  subscription_status!: string;

  @IsOptional()
  @IsString()
  subscription_starts_at?: string | null;

  @IsOptional()
  @IsString()
  subscription_ends_at?: string | null;
}

export class CreateApiClientDto {
  @IsString()
  @MaxLength(255)
  name!: string;
}

export class ReissueApiClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
