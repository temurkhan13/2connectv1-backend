import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { DiscoverService } from './discover.service';
import {
  SearchProfilesDto,
  ExpressInterestDto,
  BrowseProfileDto,
  MyInterestsDto,
  AnonymousProfileDto,
  InterestResponseDto,
  DiscoverFiltersDto,
} from './dto/discover.dto';

/**
 * Discover Controller
 * Phase 3.3: Interactive Search/Browse
 */
@ApiTags('Discover')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('discover')
export class DiscoverController {
  constructor(private readonly discoverService: DiscoverService) {}

  /**
   * Get available filter options for the Discover screen
   * Returns static options for objectives, industries, and urgency
   * Mobile app uses this to populate filter dropdowns
   */
  @Get('filters')
  @ApiOperation({ summary: 'Get available filter options' })
  @ApiResponse({
    status: 200,
    description: 'Filter options retrieved successfully',
    type: DiscoverFiltersDto,
  })
  async getFilters(): Promise<{
    code: number;
    message: string;
    result: DiscoverFiltersDto;
  }> {
    // Static filter options - can be made dynamic in the future
    // by querying active user summaries
    const filters: DiscoverFiltersDto = {
      objectives: [
        'Fundraising',
        'Partnerships',
        'Co-founder',
        'Advisory',
        'Mentorship',
        'Networking',
        'Sales',
        'Hiring',
        'Investment',
      ],
      industries: [
        'Technology',
        'Fintech',
        'Healthcare',
        'Enterprise',
        'Consumer',
        'Climate',
        'AI/ML',
        'SaaS',
        'E-commerce',
        'Biotech',
        'Real Estate',
        'Education',
        'Media',
      ],
      urgency: ['urgent', 'time_sensitive', 'ongoing'],
    };

    return {
      code: 200,
      message: 'Filter options retrieved successfully',
      result: filters,
    };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search anonymous profiles' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated anonymous profiles',
  })
  async searchProfiles(
    @Request() req,
    @Query() dto: SearchProfilesDto,
  ): Promise<{
    code: number;
    message: string;
    result: { profiles: AnonymousProfileDto[]; total: number; page: number; limit: number };
  }> {
    const result = await this.discoverService.searchProfiles(req.user.id, dto);
    return {
      code: 200,
      message: 'Profiles retrieved successfully',
      result,
    };
  }

  @Post('interest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Express interest in a profile' })
  @ApiResponse({
    status: 200,
    description: 'Interest expressed successfully',
  })
  async expressInterest(
    @Request() req,
    @Body() dto: ExpressInterestDto,
  ): Promise<{
    code: number;
    message: string;
    result: InterestResponseDto;
  }> {
    const result = await this.discoverService.expressInterest(req.user.id, dto);
    const message = result.match_created
      ? 'Mutual interest! A match has been created.'
      : 'Interest expressed successfully';
    return {
      code: 200,
      message,
      result,
    };
  }

  @Post('browse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a profile view' })
  @ApiResponse({
    status: 200,
    description: 'Browse recorded successfully',
  })
  async recordBrowse(
    @Request() req,
    @Body() dto: BrowseProfileDto,
  ): Promise<{
    code: number;
    message: string;
    result: null;
  }> {
    await this.discoverService.recordBrowse(req.user.id, dto);
    return {
      code: 200,
      message: 'Browse recorded',
      result: null,
    };
  }

  @Get('my-interests')
  @ApiOperation({ summary: 'Get my interests (sent, received, or mutual)' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated interests',
  })
  async getMyInterests(
    @Request() req,
    @Query() dto: MyInterestsDto,
  ): Promise<{
    code: number;
    message: string;
    result: { interests: any[]; total: number; page: number; limit: number };
  }> {
    const result = await this.discoverService.getMyInterests(req.user.id, dto);
    return {
      code: 200,
      message: 'Interests retrieved successfully',
      result,
    };
  }
}
