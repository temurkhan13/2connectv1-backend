import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  IsObject,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Rich Verdict DTO
 * ----------------
 * Phase 1.3: Rich AI Verdicts
 * Enhanced verdict with detailed analysis from AI conversations
 */

/**
 * Compatibility factor in verdict
 */
export class CompatibilityFactorDto {
  @ApiProperty({ example: 'Shared Industry Focus', description: 'Factor name' })
  factor: string;

  @ApiProperty({ example: 0.85, description: 'Factor score (0-1)' })
  score: number;

  @ApiProperty({
    example: 'Both users are focused on fintech and regulatory technology',
    description: 'Explanation of the factor',
  })
  explanation: string;
}

/**
 * Full verdict details
 */
export class VerdictDetailsDto {
  @ApiProperty({
    example: 'Strong alignment on business objectives with complementary skill sets',
    description: 'Overall assessment summary',
  })
  overall_assessment: string;

  @ApiProperty({
    type: [CompatibilityFactorDto],
    description: 'Breakdown of compatibility factors',
  })
  compatibility_factors: CompatibilityFactorDto[];

  @ApiProperty({
    type: [String],
    example: ['Different target markets may limit direct collaboration'],
    description: 'Potential risk factors',
    required: false,
  })
  risk_factors?: string[];

  @ApiProperty({
    type: [String],
    example: ['Joint venture opportunity in emerging markets'],
    description: 'Opportunity areas identified',
    required: false,
  })
  opportunity_areas?: string[];
}

/**
 * Rich verdict response for AI conversation
 */
export class RichVerdictResponseDto {
  @ApiProperty({ example: 'uuid', description: 'AI Conversation ID' })
  conversation_id: string;

  @ApiProperty({ example: 'uuid', description: 'Match ID' })
  match_id: string;

  @ApiProperty({
    example: 'approved',
    enum: ['approved', 'declined', 'pending'],
    description: 'Overall verdict',
  })
  verdict: string;

  @ApiProperty({
    type: VerdictDetailsDto,
    description: 'Detailed verdict analysis',
  })
  verdict_details: VerdictDetailsDto;

  @ApiProperty({
    type: [String],
    example: ['Complementary technical skills', 'Shared fundraising timeline'],
    description: 'Areas where users can help each other',
  })
  synergy_areas: string[];

  @ApiProperty({
    type: [String],
    example: ['Different communication preferences', 'Timezone challenges'],
    description: 'Potential challenges in collaboration',
  })
  friction_points: string[];

  @ApiProperty({
    type: [String],
    example: ['Technical architecture decisions', 'Go-to-market strategy'],
    description: 'Suggested topics for real conversation',
  })
  suggested_topics: string[];

  @ApiProperty({
    example: 'Schedule a 30-minute video call to discuss shared goals',
    description: 'AI recommended next action',
  })
  recommended_next_step: string;

  @ApiProperty({
    example: 0.87,
    description: 'AI confidence in the verdict (0-1)',
  })
  confidence_level: number;

  @ApiProperty({
    example: "I noticed we're both navigating Series A fundraising - would love to compare notes!",
    description: 'Personalized conversation starter',
  })
  ice_breaker: string;

  @ApiProperty({
    example: '85',
    description: 'Overall compatibility score',
  })
  compatibility_score: string;
}

/**
 * Rich verdict webhook payload from AI service
 */
export class RichVerdictWebhookPayload {
  @ApiProperty({ description: 'Match ID' })
  @IsNotEmpty()
  @IsUUID()
  match_id: string;

  @ApiProperty({ description: 'User A ID' })
  @IsNotEmpty()
  @IsUUID()
  user_a_id: string;

  @ApiProperty({ description: 'User B ID' })
  @IsNotEmpty()
  @IsUUID()
  user_b_id: string;

  @ApiProperty({ description: 'Overall verdict' })
  @IsNotEmpty()
  @IsEnum(['approved', 'declined'])
  verdict: 'approved' | 'declined';

  @ApiProperty({ description: 'Compatibility score' })
  @IsNotEmpty()
  @IsString()
  compatibility_score: string;

  @ApiProperty({ description: 'AI remarks summary' })
  @IsNotEmpty()
  @IsString()
  ai_remarks: string;

  @ApiProperty({ type: VerdictDetailsDto, required: false })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => VerdictDetailsDto)
  verdict_details?: VerdictDetailsDto;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  synergy_areas?: string[];

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  friction_points?: string[];

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggested_topics?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recommended_next_step?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence_level?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ice_breaker?: string;
}
