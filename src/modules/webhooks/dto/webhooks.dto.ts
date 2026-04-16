// submit-onboarding-section.dto.ts
import { Type } from 'class-transformer';
import {
  IsUUID,
  ValidateNested,
  // ValidatorConstraint,
  IsArray,
  ArrayUnique,
  // ValidatorConstraintInterface,
  IsString,
  IsNumber,
  ArrayMinSize,
  IsOptional,
  IsObject,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

//@ValidatorConstraint({ name: 'StringNumberOrObject', async: false })
// class StringNumberOrObject implements ValidatorConstraintInterface {
//   validate(value: any): boolean {
//     if (value === null || value === undefined) return false;
//     const t = typeof value;
//     return t === 'string' || t === 'number' || t === 'object'; // objects (incl. arrays) allowed
//   }
//   defaultMessage(): string {
//     return 'answer must be a string, number, or object';
//   }
// }

export class MatchItemDto {
  @ApiProperty({ format: 'uuid', example: '8d8b7b26-4c9f-4a1e-8f1b-4d0f0a2b9eaa' })
  @IsUUID()
  target_user_id!: string; // keep snake_case to match incoming JSON

  @ApiProperty({ format: 'string', example: 'Product Manager' })
  @IsString()
  target_user_designation!: string; // keep snake_case to match incoming JSON

  @ApiProperty({ example: 78, description: 'AI-calculated match score (0-100)' })
  @IsOptional()
  @IsNumber()
  match_score?: number; // AI-calculated score, defaults to 50 if not provided
}

export class MatchesItemDto {
  @ApiProperty({ format: 'uuid', example: '8d8b7b26-4c9f-4a1e-8f1b-4d0f0a2b9eaa' })
  @IsUUID()
  user_a_id!: string; // keep snake_case to match incoming JSON

  @ApiProperty({ format: 'string', example: 'Product Manager' })
  @IsString()
  user_a_designation!: string; // keep snake_case to match incoming JSON

  @ApiProperty({ format: 'uuid', example: '8d8b7b26-4c9f-4a1e-8f1b-4d0f0a2b9eaa' })
  @IsUUID()
  user_b_id!: string; // keep snake_case to match incoming JSON

  @ApiProperty({ format: 'string', example: 'Product Manager' })
  @IsString()
  user_b_designation!: string; // keep snake_case to match incoming JSON

  @ApiProperty({ example: 78, description: 'AI-calculated match score (0-100)' })
  @IsOptional()
  @IsNumber()
  match_score?: number; // AI-calculated score, defaults to 50 if not provided

  @ApiProperty({ description: 'AI-generated match explanation/reason' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiProperty({ description: 'Match tier: perfect, strong, worth_exploring, low' })
  @IsOptional()
  @IsString()
  match_tier?: string;

  @ApiProperty({ description: 'Synergy areas between the two users' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  synergy_areas?: string[];

  @ApiProperty({ description: 'Potential friction points' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  friction_points?: string[];

  @ApiProperty({ description: 'Suggested talking points' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  talking_points?: string[];

  @ApiProperty({ description: 'One-line headline for the match' })
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiProperty({ description: 'Short bullet-point key facts about the match' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  key_points?: string[];

  @ApiProperty({ description: 'Per-dimension score breakdown (role_fit, stage_match, geography_match, industry_match)' })
  @IsOptional()
  @IsObject()
  score_breakdown?: Record<string, number>;
}

export class UserMatchesReadyWebhookDto {
  @ApiProperty({ format: 'uuid', example: '1b4e28ba-2fa1-11d2-883f-0016d3cca427' })
  @IsUUID()
  batch_id!: string;

  @ApiProperty({ format: 'uuid', example: 'f9b37a1a-1a2b-4a7c-9a2e-7a4b0848c6e1' })
  @IsUUID()
  user_id!: string;

  @ApiProperty({ type: [MatchItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchItemDto)
  @ArrayUnique((i: MatchItemDto) => i.target_user_id)
  matches!: MatchItemDto[];
}

export class MatchesReadyWebhookDto {
  @ApiProperty({ format: 'uuid', example: '1b4e28ba-2fa1-11d2-883f-0016d3cca427' })
  @IsUUID()
  batch_id!: string;

  @ApiProperty({ type: [MatchesItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchesItemDto)
  matches!: MatchesItemDto[];
}

export class SummaryReadyDto {
  @ApiProperty({ format: 'uuid', example: '8d8b7b26-4c9f-4a1e-8f1b-4d0f0a2b9eaa' })
  @IsUUID()
  user_id: string;

  @ApiProperty({ format: 'string', example: 'Sample Summary' })
  @IsString()
  summary: string;
}

export class AiChatMessageDto {
  @IsUUID()
  sender_id!: string; // must be either initiator_id or responder_id

  @IsString()
  content!: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Compatibility factor from AI analysis
 * Phase 1.3: Rich AI Verdicts
 */
export class CompatibilityFactorDto {
  @IsString()
  factor!: string;

  @IsOptional()
  score?: number;

  @IsString()
  explanation!: string;
}

/**
 * Detailed verdict structure
 * Phase 1.3: Rich AI Verdicts
 */
export class VerdictDetailsWebhookDto {
  @IsString()
  overall_assessment!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompatibilityFactorDto)
  compatibility_factors?: CompatibilityFactorDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  risk_factors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  opportunity_areas?: string[];
}

export class AiChatReadyDto {
  @IsUUID()
  initiator_id!: string; // will be mapped to user_a_id

  @IsUUID()
  responder_id!: string; // will be mapped to user_b_id

  @IsUUID()
  match_id!: string;

  @IsString()
  ai_remarks!: string; // 2–3 words, short AI comment like: "Strong fit"

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  conversation_data: AiChatMessageDto[];

  @IsOptional()
  compatibility_score?: number;

  // === Phase 1.3: Rich AI Verdicts ===
  @IsOptional()
  @ValidateNested()
  @Type(() => VerdictDetailsWebhookDto)
  verdict_details?: VerdictDetailsWebhookDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  synergy_areas?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  friction_points?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggested_topics?: string[];

  @IsOptional()
  @IsString()
  recommended_next_step?: string;

  @IsOptional()
  confidence_level?: number;

  @IsOptional()
  @IsString()
  ice_breaker?: string;
}
