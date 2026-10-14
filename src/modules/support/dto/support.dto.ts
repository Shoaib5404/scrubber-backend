import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PORTAL_CATEGORIES,
  PUBLIC_CATEGORIES,
  SUPPORT_STATUSES,
} from '../support.constants';

export class CreatePublicInquiryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organization?: string;

  @ApiProperty({ enum: PUBLIC_CATEGORIES })
  @IsIn([...PUBLIC_CATEGORIES])
  category!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  message!: string;
}

export class CreatePortalInquiryDto {
  @ApiProperty({ enum: PORTAL_CATEGORIES })
  @IsIn([...PORTAL_CATEGORIES])
  category!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  related_batch_id?: number;

  @ApiPropertyOptional({
    description: 'Object key from prior attachment presign + PUT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  attachment_object_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_original_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  attachment_mime_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  attachment_size_bytes?: number;
}

export class PresignInquiryAttachmentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalFilename!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  mimeType!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sizeBytes!: number;
}

export class ListInquiriesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  per_page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...SUPPORT_STATUSES])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;
}

export class PatchInquiryStatusDto {
  @ApiProperty({ enum: SUPPORT_STATUSES })
  @IsIn([...SUPPORT_STATUSES])
  status!: string;
}

export class CreateInquiryReplyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body!: string;
}
