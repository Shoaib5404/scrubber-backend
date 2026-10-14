import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PeriodFilterQueryDto } from '../../../common/period/period-filter.dto';
import {
  ACTIVITY_PERIODS,
  type ActivityPeriod,
} from '../../../common/period/period.util';

export const DASHBOARD_PERIODS = ACTIVITY_PERIODS;
export type DashboardPeriod = ActivityPeriod;

export class DashboardStatsQueryDto extends PeriodFilterQueryDto {}

export class DashboardActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number = 10;
}

export class DashboardRecentBatchesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number = 10;
}
