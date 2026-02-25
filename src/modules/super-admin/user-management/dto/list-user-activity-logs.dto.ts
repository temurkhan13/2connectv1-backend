import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * ListUserActivityLogsDto
 * ----------------------
 * Purpose:
 * - Validate user activity logs listing API query parameters with pagination and filters.
 *
 * Summary:
 * - Page: current page number (default: 1)
 * - Limit: results per page (default: 20, max: 100)
 * - User ID: optional filter by specific user
 */
export class ListUserActivityLogsDto {
  @ApiProperty({
    example: 1,
    description: 'Page number starting from 1. Each page contains up to limit results.',
    required: false,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    example: 20,
    description: 'Results per page. Default: 20, Maximum: 100.',
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'filter by specific user ID (UUID format)',
    required: false,
  })
  @IsDefined()
  @IsUUID()
  user_id?: string;
}
