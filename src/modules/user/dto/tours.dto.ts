/**
 * Tours DTOs
 * For reading + updating per-user product-tour completion state.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * Valid tour names. MUST match the TourName union in both
 *   2connectv1-frontend/src/tooltips/copy.ts
 *   2connect-mobile-app/src/tooltips/copy.ts
 *
 * Adding a tour: append here, then add the step-list to copy.ts in both
 * clients, then add a data-tour-id anchor in the surface that owns the tour.
 */
export const TOUR_NAMES = ['dashboard', 'matches', 'match-detail', 'discover', 'chat'] as const;

export type TourName = (typeof TOUR_NAMES)[number];

export class TourNameParamDto {
  @ApiProperty({
    example: 'dashboard',
    enum: TOUR_NAMES,
    description: 'Name of the product tour. Closed set — server rejects unknown names.',
  })
  @IsIn(TOUR_NAMES as unknown as string[])
  name: TourName;
}

export class ToursSeenResponseDto {
  @ApiProperty({
    example: {
      dashboard: '2026-04-24T10:00:00.000Z',
      matches: null,
    },
    description:
      'Map of tour name → ISO8601 timestamp of first completion. Missing keys mean not yet seen.',
  })
  tours_seen: Record<string, string>;
}

export class MarkTourCompleteResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: '2026-04-24T10:00:00.000Z',
    description: 'Timestamp recorded for this completion (kept from first completion if already set — idempotent).',
  })
  completed_at: string;
}
