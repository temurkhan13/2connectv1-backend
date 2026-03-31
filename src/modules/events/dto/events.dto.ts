import { IsString, IsOptional, IsArray, IsDateString, IsInt, Min, Max, ArrayMaxSize, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() event_date: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() event_end_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10000) max_participants?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() organiser_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organiser_email?: string;
}

export class UpdateEventDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() event_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() event_end_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10000) max_participants?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() organiser_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organiser_email?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['upcoming', 'active', 'ended', 'cancelled']) status?: string;
}

export const VALID_EVENT_GOALS = [
  'find_investors',
  'find_cofounders',
  'find_customers',
  'find_jobs',
  'network_general',
] as const;

export class JoinEventDto {
  @ApiProperty({ description: 'Event access code distributed by organiser' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Networking goals for this event (max 2)', example: ['find_investors', 'find_customers'] })
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  goals: string[];
}

// Goal complementarity matrix — which goal pairs create value
export const GOAL_COMPLEMENTARITY: Record<string, string[]> = {
  find_investors: ['find_customers'],      // investor ↔ founder seeking customers/funding
  find_cofounders: ['find_cofounders'],    // cofounder ↔ cofounder
  find_customers: ['find_investors'],      // founder ↔ investor
  find_jobs: [],                           // job seekers matched by platform, not event goals
  network_general: ['network_general'],    // general ↔ general (weak boost)
};

export function areGoalsComplementary(goalsA: string[], goalsB: string[]): boolean {
  for (const goalA of goalsA) {
    const complements = GOAL_COMPLEMENTARITY[goalA] || [];
    for (const goalB of goalsB) {
      if (complements.includes(goalB)) return true;
    }
  }
  return false;
}
