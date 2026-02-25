import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, IsOptional, Min, Max } from 'class-validator';

/**
 * Ice Breakers DTO
 * ----------------
 * Phase 1.2: Guided First Message
 * Data transfer objects for ice breakers feature
 */

/**
 * Get Ice Breakers Request
 */
export class GetIceBreakersDto {
  @ApiProperty({ example: 'uuid', description: 'Match ID' })
  @IsNotEmpty()
  @IsString()
  match_id: string;
}

/**
 * Track Ice Breaker Usage Request
 */
export class TrackIceBreakerUsageDto {
  @ApiProperty({ example: 'uuid', description: 'Match ID' })
  @IsNotEmpty()
  @IsString()
  match_id: string;

  @ApiProperty({
    example: 0,
    description: 'Index of the selected suggestion (0-based)',
    minimum: 0,
    maximum: 10,
  })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  @Max(10)
  selected_index: number;
}

/**
 * Ice Breakers Response
 */
export class IceBreakersResponseDto {
  @ApiProperty({ example: 'uuid', description: 'Match ID' })
  match_id: string;

  @ApiProperty({ example: 'uuid', description: 'Ice breaker record ID' })
  id: string;

  @ApiProperty({
    type: [String],
    example: [
      "I noticed we're both in fintech - I'd love to hear about your approach to regulatory compliance.",
      'Your experience with Series A fundraising caught my attention. What was the biggest challenge?',
      "I see we share an interest in AI applications. Are you exploring any new use cases?",
    ],
    description: 'AI-generated conversation starters',
  })
  suggestions: string[];

  @ApiProperty({
    example: null,
    description: 'Index of selected suggestion (null if none selected)',
    nullable: true,
  })
  selected_suggestion: number | null;

  @ApiProperty({
    example: false,
    description: 'Whether this was retrieved from cache',
  })
  cached: boolean;
}

/**
 * Ice Breaker Usage Response
 */
export class IceBreakerUsageResponseDto {
  @ApiProperty({ example: true, description: 'Whether the usage was tracked successfully' })
  success: boolean;

  @ApiProperty({ example: 'uuid', description: 'Ice breaker record ID' })
  ice_breaker_id: string;

  @ApiProperty({ example: 0, description: 'Index of the selected suggestion' })
  selected_index: number;

  @ApiProperty({ example: '2026-02-10T10:30:00.000Z', description: 'When the ice breaker was used' })
  used_at: string;
}
