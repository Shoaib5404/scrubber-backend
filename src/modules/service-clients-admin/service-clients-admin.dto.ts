import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SERVICE_CLIENT_SCOPES } from './service-clients.constants';

export class CreateServiceClientDto {
  @ApiProperty({
    description:
      'Display name for this platform service client (NeoMD own apps; not a customer tenant).',
    example: 'TeleWound',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    type: [String],
    description: 'API scopes. Defaults in UI to reference:read.',
    example: ['reference:read'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn([...SERVICE_CLIENT_SCOPES], { each: true })
  scopes!: string[];
}

export class ReissueServiceClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class ListServiceClientsQueryDto {
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
