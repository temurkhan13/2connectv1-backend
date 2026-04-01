import {
  Controller,
  UseGuards,
  Request,
  Res,
  HttpCode,
  Get,
  Body,
  Post,
  Query,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOperation,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { RESPONSES } from 'src/common/responses';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';
import {
  decideMatchDto,
  ListMatchesDto,
  submitMatchFeedbackDto,
  CountMatchesDto,
  ListAgentReviewMatchesDto,
  CountAgentReviewMatchesDto,
  RegenerateEmbeddingsDto,
} from 'src/modules/dashboard/dto/dashboard.dto';
import { TrackIceBreakerUsageDto } from 'src/modules/dashboard/dto/ice-breakers.dto';
import {
  MatchStatusEnum,
  AgentReviewStatusEnum,
  AgnetReviewSubStatusEnum,
  SubStatusEnum,
} from 'src/common/enums';

/**
 * DashboardController
 * -------------------
 * Purpose:
 * - Expose read and action endpoints for the user's dashboard.
 * - All routes here are JWT-protected and return 200 on success.
 *
 * How it works:
 * - Extract the authenticated user's id from the request.
 * - Call the corresponding DashboardService method.
 * - Return the service response as-is.
 *
 * Endpoints:
 * - GET /dashboard/onboarding-matches: list onboarding matches for the user.
 * - POST /dashboard/decide-match: accept or reject a match for the user.
 * - GET /dashboard/quick-stats: fetch quick numeric stats for the user.
 * - GET /dashboard/ai-match-analytics: fetch summarized AI match analytics.
 */
@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  /**
   * Dependencies:
   * - dashboardService: business logic layer for dashboard data and actions.
   */
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/onboarding-matches
   * ---------------------------------
   * Summary:
   * - Returns the user's onboarding matches.
   *
   * Flow:
   * 1) Read user id from JWT-authenticated request.
   * 2) Ask the service for matches.
   * 3) Return the list to the client.
   */
  @Get('onboarding-matches')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.onboardingMatchesSuccess.code,
    description: RESPONSES.onboardingMatchesSuccess.message,
    example: RESPONSES.onboardingMatchesSuccess,
  })
  async getOnboardingMatches(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.dashboardService.getOnboardingMatches(userId);
    return response;
  }

  /**
   * POST /dashboard/decide-match
   * ----------------------------
   * Summary:
   * - Records the user's decision on a specific match.
   *
   * Body DTO:
   * - decideMatchDto (status and match id are taken from the request body).
   *
   * Flow:
   * 1) Read user id from JWT-authenticated request.
   * 2) Read match id and decision status from body.
   * 3) Ask the service to save the decision.
   * 4) Return the service response.
   */
  @Post('decide-match')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiBody({ type: decideMatchDto })
  @ApiResponse({
    status: RESPONSES.decideMatchSuccess.code,
    description: RESPONSES.decideMatchSuccess.message,
    example: RESPONSES.decideMatchSuccess,
  })
  async decideMatch(
    @Request() req,
    @Body() body: decideMatchDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const matchId = body.match_id;

    // Phase 2.1: Check if this is a feedback with reasons request (new flow)
    // New flow uses 'decision' field; old flow uses 'status' field
    if (body.decision && body.reason_tags) {
      // New flow: Feedback with structured reason tags
      const response = await this.dashboardService.submitMatchFeedbackWithReasons(
        userId,
        matchId,
        body.decision,
        body.reason_tags,
        body.reason_text,
        body.decision_time_ms,
      );

      // Also update the match decision itself
      const decisionAsStatus = body.decision === 'approved' ? 'approved' : 'declined';
      await this.dashboardService.decideMatch(matchId, userId, decisionAsStatus as any);

      return response;
    }

    // Old flow: Simple status update without feedback
    const status = body.status || body.decision;
    const response = await this.dashboardService.decideMatch(matchId, userId, status as any);
    return response;
  }

  /**
   * GET /dashboard/quick-stats
   * --------------------------
   * Summary:
   * - Returns quick dashboard counters and small summaries.
   *
   * Flow:
   * 1) Read user id from JWT-authenticated request.
   * 2) Ask the service for quick stats.
   * 3) Return the stats object.
   */
  @Get('quick-stats')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.quickStatsSuccess.code,
    description: RESPONSES.quickStatsSuccess.message,
    example: RESPONSES.quickStatsSuccess,
  })
  async quickStats(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.dashboardService.quickStats(userId);
    return response;
  }

  /**
   * GET /dashboard/ai-match-analytics
   * ---------------------------------
   * Summary:
   * - Returns AI-driven match analytics for the user.
   *
   * Flow:
   * 1) Read user id from JWT-authenticated request.
   * 2) Ask the service for AI match analytics.
   * 3) Return the analytics payload.
   */
  @Get('ai-match-analytics')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.aiMatchAnalyticsSuccess.code,
    description: RESPONSES.aiMatchAnalyticsSuccess.message,
    example: RESPONSES.aiMatchAnalyticsSuccess,
  })
  async aiMatchAnalytics(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const response = await this.dashboardService.aiMatchAnalytics(userId);
    return response;
  }

  @Get('insights')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Top pending matches with tier, synergy preview, and score' })
  async dashboardInsights(@Request() req) {
    const userId = req.user.id;
    return this.dashboardService.dashboardInsights(userId);
  }

  /**
   * submitMatchFeedback endpoint
   * ----------------------------
   * Purpose:
   * - Accepts feedback for a specific match from the logged-in user.
   * - Verifies the user via JWT guard.
   * - Extracts `match_id` and `feedback` from the request body (DTO validated).
   * - Calls the service to decide whether the user is A or B and update the right column.
   * Response:
   * - Returns the updated match record (or a shaped object) from the service.
   */
  @Post('submit-match-feedback')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.submitMatchFeedbackSuccess.code,
    description: RESPONSES.submitMatchFeedbackSuccess.message,
    example: RESPONSES.submitMatchFeedbackSuccess,
  })
  async submitMatchFeedback(
    @Request() req,
    @Body() body: submitMatchFeedbackDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const match_id = body.match_id;
    const feedback = body.feedback;
    const response = await this.dashboardService.submitMatchFeedback(userId, match_id, feedback);
    return response;
  }

  /**
   * recentAgentActivity endpoint
   * ----------------------------
   * Purpose:
   * - Returns recent agent/user activity for the last 7 days for the logged-in user.
   * - Verifies the user via JWT guard.
   * - Reads pagination from query: `page` and `limit` (validated via DTO or defaults).
   * - Delegates to service which filters only dashboard-relevant event types and time range.
   * Response:
   * - Paginated list with items, page meta, and time window (ISO).
   */
  @Get('recent-agent-activity')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.recentAgentActivitySuccess.code,
    description: RESPONSES.recentAgentActivitySuccess.message,
    example: RESPONSES.recentAgentActivitySuccess,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: '1-based page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page (max 100)',
  })
  async recentAgentActivity(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.id;
    const currentPage = Number.isFinite(+page!) && +page! > 0 ? +page! : 1;
    const pageSize = Number.isFinite(+limit!) && +limit! > 0 ? +limit! : 10;

    const response = await this.dashboardService.recentAgentActivity(userId, currentPage, pageSize);
    return response;
  }

  /**
   * GET /dashboard/matches
   * ----------------------
   * Summary:
   * - Returns paginated matches for the logged-in user.
   *
   * Flow:
   * 1) Read user id from JWT.
   * 2) Validate and parse filters from query (page, limit, status, sub_status, dates).
   * 3) Ask service for paginated results.
   * 4) Return meta + items.
   */
  @Get('list-matches')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List matches (paginated + filterable)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (>=1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Page size (1..100)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: MatchStatusEnum,
    example: MatchStatusEnum.PENDING,
    description: 'Match status filter',
  })
  @ApiQuery({
    name: 'sub_status',
    required: false,
    enum: SubStatusEnum,
    example: SubStatusEnum.ALL,
    description:
      'Sub status filter. Ignored when status=pending. For approved: approved | awaiting_other | all. For declined: passed_by_me | passed_by_other | passed | all.',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    type: String,
    example: '2025-01-01',
    description: 'Filter from this date (YYYY-MM-DD) inclusive',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    type: String,
    example: '2025-12-31',
    description: 'Filter up to this date (YYYY-MM-DD) inclusive',
  })
  @ApiResponse({
    status: RESPONSES.listMatchesSuccess.code,
    description: RESPONSES.listMatchesSuccess.message,
    example: RESPONSES.listMatchesSuccess,
  })
  async listMatches(
    @Request() req,
    @Query() query: ListMatchesDto,
    @Res({ passthrough: true }) _res: Response,
  ) {
    const userId = req.user.id;
    // Delegates all filtering/pagination logic to service
    const response = await this.dashboardService.listMatches(userId, query);
    return response;
  }

  /**
   * GET /matches/counts?start_date=&end_date=
   * Returns counts for: pending, approved.{approved, awaiting_other}, passed.{passed_by_me, passed_by_other, passed}
   */
  @Get('matches-count')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.matchesCountSuccess.code,
    description: RESPONSES.matchesCountSuccess.message,
    example: RESPONSES.matchesCountSuccess,
  })
  async countMatches(@Request() req, @Query() query: CountMatchesDto) {
    const userId = req.user.id as string;
    return this.dashboardService.countMatchesByStatus(userId, query);
  }

  /**
   * GET /dashboard/agent-review-matches
   * ----------------------
   * Summary:
   * - Returns paginated matches for the logged-in user's agent.
   *
   * Flow:
   * 1) Read user id from JWT.
   * 2) Validate and parse filters from query (page, limit, status, sub_status, dates).
   * 3) Ask service for paginated results.
   * 4) Return meta + items.
   */
  @Get('agent-review-matches')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List agent review matches (paginated + filterable)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (>=1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Page size (1..100)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: AgentReviewStatusEnum,
    example: AgentReviewStatusEnum.APPROVED,
    description: 'Match status filter',
  })
  @ApiQuery({
    name: 'sub_status',
    required: false,
    enum: AgnetReviewSubStatusEnum,
    example: AgnetReviewSubStatusEnum.ALL,
    description: 'Sub status filter. all.',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    type: String,
    example: '2025-01-01',
    description: 'Filter from this date (YYYY-MM-DD) inclusive',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    type: String,
    example: '2025-12-31',
    description: 'Filter up to this date (YYYY-MM-DD) inclusive',
  })
  @ApiResponse({
    status: RESPONSES.agentReviewMatchesSuccess.code,
    description: RESPONSES.agentReviewMatchesSuccess.message,
    example: RESPONSES.agentReviewMatchesSuccess,
  })
  async agentReviewMatches(
    @Request() req,
    @Query() query: ListAgentReviewMatchesDto,
    @Res({ passthrough: true }) _res: Response,
  ) {
    const userId = req.user.id;
    // Delegates all filtering/pagination logic to service
    const response = await this.dashboardService.listAgentReviewMatches(userId, query);
    return response;
  }

  /**
   * GET /matches/counts?start_date=&end_date=
   * Returns counts for: pending, approved.{approved, awaiting_other}, passed.{passed_by_me, passed_by_other, passed}
   */
  @Get('agent-review-matches-count')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.agentReviewMatchesCountSuccess.code,
    description: RESPONSES.agentReviewMatchesCountSuccess.message,
    example: RESPONSES.agentReviewMatchesCountSuccess,
  })
  async countAgentReviewMatches(
    @Request() req,
    @Query() query: CountMatchesDto | CountAgentReviewMatchesDto,
  ) {
    const userId = req.user.id as string;
    return this.dashboardService.countAgentReviewMatchesByStatus(userId, query);
  }

  /**
   * GET /dashboard/match-explanation/:matchId
   * -----------------------------------------
   * Phase 1.1: Match Explanation UI
   * Summary:
   * - Returns AI-generated explanation for why two users matched.
   * - Includes synergy areas, friction points, and suggested talking points.
   *
   * Flow:
   * 1) Read user id from JWT.
   * 2) Validate user is a participant in the match.
   * 3) Return cached explanation or generate fresh via AI service.
   */
  @Get('match-explanation/:matchId')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get match explanation (Phase 1.1)' })
  @ApiQuery({
    name: 'force_refresh',
    required: false,
    type: Boolean,
    example: false,
    description: 'Force refresh of cached explanation',
  })
  @ApiResponse({
    status: 200,
    description: 'Match explanation retrieved successfully',
  })
  async getMatchExplanation(
    @Request() req,
    @Param('matchId') matchId: string,
    @Query('force_refresh') forceRefreshParam?: string | boolean,
  ) {
    const userId = req.user.id as string;
    const forceRefresh = forceRefreshParam === true || forceRefreshParam === 'true';
    return this.dashboardService.getMatchExplanation(matchId, userId, forceRefresh);
  }

  /**
   * GET /dashboard/ice-breakers/:matchId
   * ------------------------------------
   * Phase 1.2: Guided First Message
   * Summary:
   * - Returns AI-generated conversation starters for a match.
   * - Cached per user per match.
   */
  @Get('ice-breakers/:matchId')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ice breakers for a match (Phase 1.2)' })
  @ApiResponse({
    status: 200,
    description: 'Ice breakers retrieved successfully',
  })
  async getIceBreakers(@Request() req, @Param('matchId') matchId: string) {
    const userId = req.user.id as string;
    return this.dashboardService.getIceBreakers(matchId, userId);
  }

  /**
   * POST /dashboard/ice-breakers/track-usage
   * ----------------------------------------
   * Phase 1.2: Guided First Message
   * Summary:
   * - Records when a user selects/uses an ice breaker.
   * - Used for analytics on which suggestions are most effective.
   */
  @Post('ice-breakers/track-usage')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Track ice breaker usage (Phase 1.2)' })
  @ApiBody({ type: TrackIceBreakerUsageDto })
  @ApiResponse({
    status: 200,
    description: 'Ice breaker usage tracked successfully',
  })
  async trackIceBreakerUsage(@Request() req, @Body() body: TrackIceBreakerUsageDto) {
    const userId = req.user.id as string;
    return this.dashboardService.trackIceBreakerUsage(body.match_id, userId, body.selected_index);
  }

  // ==========================================
  // Admin Dashboard Diagnostics
  // System health, matching diagnostics - no JWT required
  // ==========================================

  /**
   * GET /dashboard/admin/system-health
   * ----------------------------------
   * Summary:
   * - Returns comprehensive health status of all AI components.
   * - Used by admin dashboard to show green/red blips.
   */
  @Get('admin/system-health')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get system health status (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'System health retrieved successfully',
  })
  async getSystemHealth() {
    return this.dashboardService.getSystemHealth();
  }

  /**
   * GET /dashboard/admin/matching-diagnostics
   * -----------------------------------------
   * Summary:
   * - Returns all users with their matching parameters.
   * - Shows embeddings, intent classification, bidirectional scores, etc.
   */
  @Get('admin/matching-diagnostics')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get matching diagnostics for all users (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Matching diagnostics retrieved successfully',
  })
  async getMatchingDiagnostics() {
    return this.dashboardService.getMatchingDiagnostics();
  }

  /**
   * GET /dashboard/admin/user-list
   * ------------------------------
   * Summary:
   * - Returns list of all users with their status.
   */
  @Get('admin/user-list')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get admin user list (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'User list retrieved successfully',
  })
  async getAdminUserList() {
    return this.dashboardService.getAdminUserList();
  }

  /**
   * GET /dashboard/admin/wiring-audit
   * ---------------------------------
   * Summary:
   * - Returns truth-based health check for latest completed user.
   * - Verifies end-to-end pipeline: embeddings, persona, matches.
   */
  @Get('admin/wiring-audit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get wiring audit - truth-based health check (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Wiring audit retrieved successfully',
  })
  async getWiringAudit() {
    return this.dashboardService.getWiringAudit();
  }

  /**
   * POST /dashboard/admin/regenerate-embeddings
   * -------------------------------------------
   * Summary:
   * - Triggers embedding regeneration for a user.
   * - Used to fix incomplete embeddings or regenerate after data updates.
   * - Fixes issue where persona generation completed but embeddings are incomplete.
   */
  @Post('admin/regenerate-embeddings')
  @HttpCode(200)
  @ApiOperation({ summary: 'Regenerate embeddings for a user (Admin)' })
  @ApiBody({ type: RegenerateEmbeddingsDto })
  @ApiResponse({
    status: 200,
    description: 'Embedding regeneration triggered successfully',
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to trigger embedding regeneration',
  })
  async regenerateEmbeddings(@Body() body: RegenerateEmbeddingsDto) {
    return this.dashboardService.regenerateEmbeddings(body.user_id);
  }
}
