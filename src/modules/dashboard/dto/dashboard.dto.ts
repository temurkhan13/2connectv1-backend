import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Min,
  IsEnum,
  IsDate,
  Equals,
  IsNumberString,
  IsArray,
  IsNumber,
} from 'class-validator';
import {
  DecideMatchEnum,
  MatchStatusEnum,
  SubStatusEnum,
  AgentReviewStatusEnum,
} from 'src/common/enums';

export class decideMatchDto {
  @ApiProperty({ example: 'approved', description: 'Legacy field - use "decision" for new implementations' })
  @IsOptional()
  @IsString()
  status?: DecideMatchEnum;

  @ApiProperty({ example: 'approved', description: 'Decision: approved or declined' })
  @IsOptional()
  @IsString()
  decision?: 'approved' | 'declined';

  @ApiProperty({ example: 'uuid' })
  @IsNotEmpty()
  @IsString()
  match_id: string;

  // Phase 2.1: Feedback with reasons
  @ApiProperty({
    example: ['wrong_industry', 'bad_timing'],
    description: 'Reason tags for the decision',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reason_tags?: string[];

  @ApiProperty({
    example: 'The industry focus does not align with my current goals',
    description: 'Free-text explanation',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason_text?: string;

  @ApiProperty({
    example: 5000,
    description: 'Time taken to make the decision in milliseconds',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  decision_time_ms?: number;
}

export class submitMatchFeedbackDto {
  @ApiProperty({ example: 'feedback' })
  @IsNotEmpty()
  @IsString()
  feedback: string;

  @ApiProperty({ example: 'uuid' })
  @IsNotEmpty()
  @IsString()
  match_id: string;
}

export class ListMatchesDto {
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
    enum: MatchStatusEnum,
    description: 'Filter by status. Options: pending, approved, declined',
    required: false,
    default: MatchStatusEnum.PENDING,
    example: MatchStatusEnum.PENDING,
  })
  @IsOptional()
  @IsEnum(MatchStatusEnum)
  status?: MatchStatusEnum;

  @ApiProperty({
    enum: SubStatusEnum,
    description:
      'Filter by sub status. Options: all, awaiting_other, approved, passed_by_me, passed_by_other, passed',
    required: false,
    default: SubStatusEnum.ALL,
    example: SubStatusEnum.ALL,
  })
  @IsOptional()
  @IsEnum(SubStatusEnum)
  sub_status?: SubStatusEnum;

  @ApiProperty({
    example: '2025-01-01',
    description: 'Filter by match date. Format: YYYY-MM-DD',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date?: Date;

  @ApiProperty({
    example: '2025-01-01',
    description: 'Filter by match date. Format: YYYY-MM-DD',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  end_date?: Date;

  @ApiProperty({ description: 'agent: 0' })
  @IsOptional()
  @IsNumberString()
  agent: string;
}

export class CountMatchesDto {
  @ApiProperty({
    example: '2025-01-01',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date?: Date;

  @ApiProperty({
    example: '2025-01-01',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  end_date?: Date;

  @ApiProperty({ description: 'agent: 0' })
  @IsOptional()
  @IsNumberString()
  agent: string;
}

export class ListAgentReviewMatchesDto {
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
    enum: AgentReviewStatusEnum,
    description: 'Filter by status. Options: approved, declined',
    required: false,
    default: AgentReviewStatusEnum.APPROVED,
    example: AgentReviewStatusEnum.APPROVED,
  })
  @IsOptional()
  @IsEnum(AgentReviewStatusEnum)
  status?: AgentReviewStatusEnum;

  @ApiProperty({
    example: '2025-01-01',
    description: 'Filter by match date. Format: YYYY-MM-DD',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date?: Date;

  @ApiProperty({
    example: '2025-01-01',
    description: 'Filter by match date. Format: YYYY-MM-DD',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  end_date?: Date;

  @ApiProperty({ description: 'agent: 1 or 0' })
  @IsOptional()
  @IsNumberString()
  @Equals('1', { message: 'agent must always be 1' })
  agent: string;
}

export class CountAgentReviewMatchesDto {
  @ApiProperty({
    example: '2025-01-01',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date?: Date;

  @ApiProperty({
    example: '2025-01-01',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  end_date?: Date;

  @ApiProperty({ description: 'agent: 1 or 0' })
  @IsOptional()
  @IsNumberString()
  @Equals('1', { message: 'agent must always be 1' })
  agent: string;
}
