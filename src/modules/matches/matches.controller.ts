/**
 * Matches Controller
 * ------------------
 * API endpoints for retrieving matches.
 * All matching logic is delegated to the AI service.
 */

import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MatchesService, FormattedMatch } from 'src/modules/matches/matches.service';

@ApiTags('Matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  /**
   * Get all matches for the authenticated user
   */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all matches for the authenticated user' })
  @ApiQuery({
    name: 'similarity_threshold',
    required: false,
    type: Number,
    description: 'Minimum similarity score (0.0 to 1.0)',
  })
  async getMyMatches(
    @Request() req,
    @Query('similarity_threshold') similarityThreshold?: number,
  ): Promise<{ matches: FormattedMatch[]; total: number }> {
    const userId = req.user.id;
    return this.matchesService.getUserMatches(userId, similarityThreshold);
  }

  /**
   * Get matches for a specific user (admin/debug)
   */
  @Get('user/:userId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all matches for a specific user' })
  @ApiQuery({
    name: 'similarity_threshold',
    required: false,
    type: Number,
    description: 'Minimum similarity score (0.0 to 1.0)',
  })
  async getUserMatches(
    @Param('userId') userId: string,
    @Query('similarity_threshold') similarityThreshold?: number,
  ): Promise<{ matches: FormattedMatch[]; total: number }> {
    return this.matchesService.getUserMatches(userId, similarityThreshold);
  }

  /**
   * Get requirements matches (users who can fulfill what I need)
   */
  @Get('requirements')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get users whose offerings match what I need' })
  @ApiQuery({
    name: 'similarity_threshold',
    required: false,
    type: Number,
    description: 'Minimum similarity score (0.0 to 1.0)',
  })
  async getMyRequirementsMatches(
    @Request() req,
    @Query('similarity_threshold') similarityThreshold?: number,
  ): Promise<FormattedMatch[]> {
    const userId = req.user.id;
    return this.matchesService.getRequirementsMatches(userId, similarityThreshold);
  }

  /**
   * Get offerings matches (users who need what I can offer)
   */
  @Get('offerings')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get users who need what I can offer' })
  @ApiQuery({
    name: 'similarity_threshold',
    required: false,
    type: Number,
    description: 'Minimum similarity score (0.0 to 1.0)',
  })
  async getMyOfferingsMatches(
    @Request() req,
    @Query('similarity_threshold') similarityThreshold?: number,
  ): Promise<FormattedMatch[]> {
    const userId = req.user.id;
    return this.matchesService.getOfferingsMatches(userId, similarityThreshold);
  }

  /**
   * Get matching system statistics
   */
  @Get('stats')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get matching system statistics' })
  async getMatchingStats() {
    return this.matchesService.getMatchingStats();
  }
}
