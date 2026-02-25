import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RoleEnum } from 'src/common/enums';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { RESPONSES } from 'src/common/responses';
import { DashboardService } from 'src/modules/super-admin/dashboard/dashboard.service';
import { StatsVisibilityDto } from 'src/modules/super-admin/dashboard/dto/stats-visibility.dto';

/**
 * DashboardController
 * -------------------
 * Purpose:
 * - Expose dashboard endpoints for super-admin.
 *
 * Summary:
 * - Provides counts for users and summaries.
 */
@ApiTags('Admin Dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Get dashboard counts.
   * Endpoint: GET /api/admin/dashboard/counts
   *
   * Features:
   * - Returns total users, active users, and AI Generated Summaries.
   * - Security: Requires ADMIN role and valid JWT.
   *
   * Message: "Dashboard counts retrieved successfully"
   */
  @Get('counts')
  @ApiResponse({
    status: 200,
    description:
      'Dashboard counts retrieved successfully. Returns total users, active users, and AI Generated Summaries with labels and values.',
    example: RESPONSES.dashboardCountsSuccess,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired JWT token',
    example: RESPONSES.unauthorized,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only ADMIN role users can access this resource',
    example: RESPONSES.forbidden,
  })
  async getCounts() {
    return this.dashboardService.getDashboardCounts();
  }

  /**
   * Get user signup statistics.
   * Endpoint: GET /api/admin/dashboard/user-signup-statistics
   * Query params: visibility (week or month, default: week)
   *
   * Features:
   * - Returns signup counts for last 6 weeks or 6 months.
   * - Week1/Month1 = most recent period, Week6/Month6 = oldest period.
   * - Excludes admin users.
   * - Security: Requires ADMIN role and valid JWT.
   *
   * Message: "User signup statistics retrieved successfully"
   */
  @Get('user-signup-statistics')
  @ApiQuery({
    name: 'visibility',
    required: false,
    enum: ['week', 'month'],
    description: 'Period type for statistics (week or month, default: week)',
    example: 'week',
  })
  @ApiResponse({
    status: 200,
    description:
      'User signup statistics retrieved successfully. Returns signup counts for last 6 periods.',
    example: RESPONSES.userSignupStatisticsSuccess,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid visibility parameter',
    example: RESPONSES.badRequest,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired JWT token',
    example: RESPONSES.unauthorized,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only ADMIN role users can access this resource',
    example: RESPONSES.forbidden,
  })
  async getUserSignupStatistics(@Query() query: StatsVisibilityDto) {
    return this.dashboardService.getUserSignupStatistics(query);
  }

  /**
   * Get user onboarding statistics.
   * Endpoint: GET /api/admin/dashboard/user-onboarding-statistics
   *
   * Features:
   * - Returns onboarding counts grouped by `onboarding_status`.
   * - Example response: [{ status: 'not_started', label: 'Not Started', count: 12 }, { status: 'in_progress', label: 'In Progress', count: 123 }]
   * - Excludes admin users.
   * - Security: Requires ADMIN role and valid JWT.
   */
  @Get('user-onboarding-statistics')
  @ApiResponse({
    status: 200,
    description: 'User onboarding statistics retrieved successfully.',
    example: RESPONSES.userOnboardingStatisticsSuccess,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired JWT token',
    example: RESPONSES.unauthorized,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only ADMIN role users can access this resource',
    example: RESPONSES.forbidden,
  })
  async getUserOnboardingStatistics() {
    return this.dashboardService.getUserOnboardingStatistics();
  }

  /**
   * Get common core objectives statistics.
   * Endpoint: GET /api/admin/dashboard/common-core-objectives
   *
   * Features:
   * - Aggregates users.objective and returns counts per objective value.
   * - Excludes admin users.
   */
  @Get('common-core-objectives')
  @ApiResponse({
    status: 200,
    description: 'Common core objectives statistics retrieved successfully.',
    example: RESPONSES.commonCoreObjectivesSuccess,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired JWT token',
    example: RESPONSES.unauthorized,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only ADMIN role users can access this resource',
    example: RESPONSES.forbidden,
  })
  async getCommonCoreObjectivesStatistics() {
    return this.dashboardService.getCommonCoreObjectivesStats();
  }

  /**
   * Get match acceptance/rejection rates.
   * Endpoint: GET /api/admin/dashboard/match-acceptance-rates
   * Query params: visibility (week|month, default: week)
   *
   * Returns counts by match status and percent share over the last 6 periods combined.
   */
  @Get('match-acceptance-rates')
  @ApiQuery({
    name: 'visibility',
    required: false,
    enum: ['week', 'month'],
    description: 'Period type for statistics (week or month, default: week)',
  })
  @ApiResponse({
    status: 200,
    description: 'Match acceptance/rejection rates retrieved successfully.',
    example: RESPONSES.matchAcceptanceRatesSuccess,
  })
  async getMatchAcceptanceRates(@Query() query: StatsVisibilityDto) {
    return this.dashboardService.getMatchAcceptanceRates(query);
  }

  /**
   * Get AI conversation success metrics.
   * Endpoint: GET /api/admin/dashboard/ai-conversation-success-metrics
   * Query params: visibility (week or month, default: week)
   *
   * Features:
   * - Returns conversation counts grouped by status (total, rejected, completed).
   * - Rejected: AI-to-AI conversations (user_to_user_conversation = false)
   * - Completed: User-to-user conversations (user_to_user_conversation = true)
   * - Supports time-based filtering for last 6 weeks or 6 months.
   * - Security: Requires ADMIN role and valid JWT.
   *
   * Message: "AI conversation success metrics retrieved successfully"
   */
  @Get('ai-conversation-success-metrics')
  @ApiQuery({
    name: 'visibility',
    required: false,
    enum: ['week', 'month'],
    description: 'Period type for statistics (week or month, default: week)',
    example: 'week',
  })
  @ApiResponse({
    status: 200,
    description:
      'AI conversation success metrics retrieved successfully. Returns conversation counts by status (total, rejected, completed) for the selected period.',
    example: RESPONSES.aiConversationSuccessMetricsSuccess,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid visibility parameter',
    example: RESPONSES.badRequest,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired JWT token',
    example: RESPONSES.unauthorized,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only ADMIN role users can access this resource',
    example: RESPONSES.forbidden,
  })
  async getAiConversationSuccessMetrics(@Query() query: StatsVisibilityDto) {
    return this.dashboardService.getAiConversationSuccessMetrics(query);
  }
}
