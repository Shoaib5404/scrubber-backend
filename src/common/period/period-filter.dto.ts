import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { ACTIVITY_PERIODS, type ActivityPeriod } from './period.util';

/** Shared query params for dashboard / tenant overview period filters. */
export class PeriodFilterQueryDto {
  @ApiPropertyOptional({ enum: ACTIVITY_PERIODS })
  @IsOptional()
  @IsIn(ACTIVITY_PERIODS)
  period?: ActivityPeriod = '30d';

  @ApiPropertyOptional({
    description: 'Range start (required when period=custom). YYYY-MM-DD or ISO.',
  })
  @ValidateIf((o: PeriodFilterQueryDto) => o.period === 'custom')
  @IsNotEmpty()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Range end (optional when period=custom; defaults to now).',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
