import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsArray,
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Transform comma-separated string to array.
 * Handles: "value1,value2" -> ["value1", "value2"]
 * Also handles already-array values from multiple query params.
 */
const ToArray = () =>
  Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim()).filter((v) => v);
    }
    return [value];
  });

/**
 * Phase 3.3: Interactive Search/Browse DTOs
 */

export class SearchProfilesDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({ required: false, isArray: true })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];

  @ApiProperty({ required: false, isArray: true })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];

  @ApiProperty({ required: false, enum: ['urgent', 'time_sensitive', 'ongoing', 'exploratory'] })
  @IsOptional()
  @IsString()
  urgency?: string;

  @ApiProperty({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class AnonymousProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  display_name: string;

  @ApiProperty()
  profile_summary: string;

  @ApiProperty({ isArray: true })
  objectives: string[];

  @ApiProperty()
  urgency: string;

  @ApiProperty()
  freshness_score: number;

  @ApiProperty()
  member_since: Date;

  @ApiProperty()
  last_active_at: Date;

  @ApiProperty({ required: false })
  compatibility_hint?: number;
}

export class ExpressInterestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  to_user_id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  message?: string;
}

export class InterestResponseDto {
  @ApiProperty()
  interest_id: string;

  @ApiProperty({ enum: ['pending', 'mutual', 'declined', 'expired'] })
  status: string;

  @ApiProperty({ required: false })
  match_created?: boolean;

  @ApiProperty({ required: false })
  match_id?: string;
}

export class BrowseProfileDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  viewed_user_id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  view_duration_seconds?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  source?: string;
}

export class MyInterestsDto {
  @ApiProperty({ default: 'sent', enum: ['sent', 'received', 'mutual'] })
  @IsOptional()
  @IsEnum(['sent', 'received', 'mutual'])
  type?: 'sent' | 'received' | 'mutual' = 'sent';

  @ApiProperty({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
