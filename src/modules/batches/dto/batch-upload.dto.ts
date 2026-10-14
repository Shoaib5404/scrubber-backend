import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RequestBatchUploadUrlDto {
  @ApiProperty({ example: 'claims-2026-04-01.edi' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalFilename!: string;

  @ApiProperty({ example: 'application/EDI-X12' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  mimeType!: string;

  @ApiProperty({ example: 102400, description: 'Declared file size in bytes' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_485_760)
  sizeBytes!: number;
}

export class CompleteBatchUploadDto {
  @ApiProperty({
    example: 'edi/12/34/1710000000000-a1b2c3d4e5f6.edi',
    description: 'Server-minted object key from upload-url',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  objectKey!: string;

  @ApiProperty({ example: 'claims-2026-04-01.edi' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalFilename!: string;

  @ApiProperty({ example: 'application/EDI-X12' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  mimeType!: string;

  @ApiProperty({ example: 102400 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_485_760)
  sizeBytes!: number;

  @ApiPropertyOptional({
    description: 'Optional idempotency token for clients (not persisted as UUID)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientUploadId?: string;
}
