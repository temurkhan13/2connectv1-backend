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
