import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsOptional, IsBoolean } from 'class-validator';

/**
 * Match Explanation DTO
 * ---------------------
 * Data transfer objects for match explanations feature
 * Phase 1.1: Show WHY users matched
 */

/**
 * Score breakdown for a single dimension
 * Matches frontend ScoreDimension interface
 */
export class ScoreDimensionDto {
  @ApiProperty({ example: 0.85, description: 'Score for this dimension (0-1)' })
  score: number;

  @ApiProperty({ example: 0.20, description: 'Weight of this dimension (0-1)' })
  weight: number;

  @ApiProperty({ example: 0.17, description: 'Score * weight' })
  weighted_score: number;

  @ApiProperty({ example: 'Both seeking Series A funding in fintech space', description: 'Human-readable explanation' })
  explanation: string;
}

/**
 * Multi-vector score breakdown (Phase 2.2 compatible)
 */
export class ScoreBreakdownDto {
  @ApiProperty({ type: ScoreDimensionDto, description: 'How well objectives align' })
  objective_alignment: ScoreDimensionDto;

  @ApiProperty({ type: ScoreDimensionDto, description: 'Industry/sector match' })
  industry_match: ScoreDimensionDto;

  @ApiProperty({ type: ScoreDimensionDto, description: 'Timeline compatibility' })
  timeline_compatibility: ScoreDimensionDto;

  @ApiProperty({ type: ScoreDimensionDto, description: 'Complementary skills' })
  skill_complement: ScoreDimensionDto;

  @ApiProperty({ type: ScoreDimensionDto, description: 'Experience level match' })
  experience_level: ScoreDimensionDto;

  @ApiProperty({ type: ScoreDimensionDto, description: 'Communication style fit' })
  communication_style: ScoreDimensionDto;
}

/**
 * Full match explanation response
 */
export class MatchExplanationDto {
  @ApiProperty({ example: 'uuid', description: 'Match ID' })
  match_id: string;

  @ApiProperty({
    example: 'Both are fintech founders seeking Series A, with complementary skills in technology and business development.',
    description: 'One-line summary of why they matched',
  })
  summary: string;

  @ApiProperty({
    type: [String],
    example: ['Both raising Series A', 'Complementary skill sets', 'Same target market'],
    description: 'Specific areas where users can help each other',
  })
  synergy_areas: string[];

  @ApiProperty({
    type: [String],
    example: ['Different time zones may affect communication', 'Competing in adjacent markets'],
    description: 'Potential challenges in this match',
  })
  friction_points: string[];

  @ApiProperty({
    type: [String],
    example: ['Fundraising strategies', 'Go-to-market approaches', 'Technical architecture'],
    description: 'Suggested conversation topics',
  })
  talking_points: string[];

  @ApiProperty({
    type: ScoreBreakdownDto,
    required: false,
    description: 'Detailed score breakdown by dimension (if available)',
  })
  score_breakdown?: ScoreBreakdownDto;

  @ApiProperty({
    example: 0.82,
    description: 'Overall compatibility score (0-1)',
  })
  overall_score: number;

  @ApiProperty({
    example: 'strong',
    enum: ['perfect', 'strong', 'worth_exploring', 'low'],
    description: 'Match quality tier',
  })
  match_tier: string;
}

/**
 * Request to generate match explanation
 */
export class GenerateMatchExplanationRequest {
  @ApiProperty({ example: 'uuid', description: 'Match ID' })
  @IsNotEmpty()
  @IsUUID()
  match_id: string;

  @ApiProperty({ example: 'uuid', description: 'User A ID' })
  @IsNotEmpty()
  @IsUUID()
  user_a_id: string;

  @ApiProperty({ example: 'uuid', description: 'User B ID' })
  @IsNotEmpty()
  @IsUUID()
  user_b_id: string;

  @ApiProperty({ example: false, description: 'Force regeneration even if cached', required: false })
  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean;
}
