import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatisticsVisibilityEnum } from 'src/common/utils/constants/dashboard.constant';

/**
 * StatsVisibilityDto
 * ------------------
 * Generic DTO for visibility-based statistics endpoints.
 * - visibility: week | month
 */
export class StatsVisibilityDto {
  @ApiPropertyOptional({
    enum: StatisticsVisibilityEnum,
    description: 'Period type for statistics (week or month)',
    default: StatisticsVisibilityEnum.WEEK,
    example: StatisticsVisibilityEnum.WEEK,
  })
  @IsOptional()
  @IsEnum(StatisticsVisibilityEnum, {
    message: 'visibility must be either "week" or "month"',
  })
  visibility?: StatisticsVisibilityEnum = StatisticsVisibilityEnum.WEEK;
}
