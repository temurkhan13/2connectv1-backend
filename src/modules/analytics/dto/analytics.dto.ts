import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  IsDateString,
  IsEnum,
} from 'class-validator';

/**
 * Phase 4.3: Success Metrics Pipeline DTOs
 */

export class TrackEventDto {
  @ApiProperty({ example: 'match_approve' })
  @IsString()
  event_type: string;

  @ApiProperty({ required: false, example: 'matching' })
  @IsOptional()
  @IsString()
  event_category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  event_data?: Record<string, any>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  event_value?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  session_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  source?: string;
}

export class FunnelQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cohort_week?: string;
}

export class FunnelStageDto {
  @ApiProperty()
  stage: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  unique_users: number;

  @ApiProperty()
  conversion_rate: number | null;

  @ApiProperty()
  avg_time_from_previous_hours: number | null;
}

export class FunnelReportDto {
  @ApiProperty()
  start_date: string;

  @ApiProperty()
  end_date: string;

  @ApiProperty({ type: [FunnelStageDto] })
  stages: FunnelStageDto[];

  @ApiProperty()
  overall_conversion: number;
}

export class UserEngagementDto {
  @ApiProperty()
  user_id: string;

  @ApiProperty()
  engagement_score: number;

  @ApiProperty({ enum: ['dormant', 'low', 'medium', 'high', 'power_user'] })
  activity_level: string;

  @ApiProperty()
  days_since_last_activity: number | null;

  @ApiProperty()
  total_matches_received: number;

  @ApiProperty()
  total_matches_approved: number;

  @ApiProperty()
  approval_rate: number | null;

  @ApiProperty()
  total_ai_chats_completed: number;

  @ApiProperty()
  total_messages_sent: number;

  @ApiProperty()
  total_connections_made: number;
}
