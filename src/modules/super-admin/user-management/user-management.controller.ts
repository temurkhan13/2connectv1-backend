import { Controller, Get, Param, Query, UseGuards, Patch, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RoleEnum } from 'src/common/enums';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { RESPONSES } from 'src/common/responses';
import { USER_MANAGEMENT_CONSTANTS } from 'src/common/utils/constants/user-management.constant';
import { ListUserActivityLogsDto } from 'src/modules/super-admin/user-management/dto/list-user-activity-logs.dto';
import { ListUsersDto } from 'src/modules/super-admin/user-management/dto/list-users.dto';
import { SearchUsersDto } from 'src/modules/super-admin/user-management/dto/search-users.dto';
import { UserDetailDto } from 'src/modules/super-admin/user-management/dto/user-detail.dto';
import { SetUserActivationDto } from 'src/modules/super-admin/user-management/dto/set-user-activation.dto';
import { UserManagementService } from 'src/modules/super-admin/user-management/user-management.service';

/**
 * UserManagementController
 * -----------------------
 * Purpose:
 * - Expose admin user management endpoints.
 *
 * Summary:
 * - List users with pagination/filtering (with guard).
 * - Search users by name/email (with guard).
 * - Get user detail with documents, summary, activity logs (with guard).
 * - List user activity logs with pagination (with guard).
 * - All endpoints require ADMIN role verification.
 * - Uses DTOs for validation and Swagger decorators for API documentation.
 */
@ApiTags('Admin User Management')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@ApiBearerAuth()
export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  /**
   * List users with pagination and filters.
   * Endpoint: GET /api/admin/users/list
   * Query params: page, limit, sort, order, search, onboarding_status, account_status, gender
   *
   * Features:
   * - Pagination: page (default 1) and limit (default 20, max 100)
   * - Sorting: Multiple fields with ASC/DESC order
   * - Filtering: By onboarding status, account status, and gender
   * - Searching: By name and email (case-insensitive)
   * - Security: Requires ADMIN role and valid JWT
   *
   * Message: "Users retrieved successfully"
   */
  @Get('list')
  @ApiResponse({
    status: 200,
    description: `${USER_MANAGEMENT_CONSTANTS.MESSAGES.LIST_SUCCESS}. Returns paginated list of users with all fields.`,
    example: RESPONSES.listUsersSuccess,
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
  async listUsers(@Query() query: ListUsersDto) {
    return this.userManagementService.listUsers(query);
  }

  /**
   * Search users by name/email (basic info only).
   * Endpoint: GET /api/admin/users/search
   * Query params: query (required), limit (optional, max 20)
   *
   * Features:
   * - Search across name and email fields (case-insensitive)
   * - Returns basic user info only (5 fields)
   * - No pagination - limited to 20 results max
   * - Fast search for quick user lookups
   * - Security: Requires ADMIN role and valid JWT
   *
   * Message: "User search completed"
   */
  @Get('search')
  @ApiResponse({
    status: 200,
    description: `${USER_MANAGEMENT_CONSTANTS.MESSAGES.SEARCH_SUCCESS}. Returns basic user info (id, names, email, gender, age)`,
    example: RESPONSES.searchUsersSuccess,
  })
  @ApiResponse({
    status: 400,
    description: `${USER_MANAGEMENT_CONSTANTS.MESSAGES.SEARCH_QUERY_REQUIRED}`,
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
  async searchUsers(@Query() query: SearchUsersDto) {
    return this.userManagementService.searchUsers(query);
  }

  /**
   * List user activity logs with pagination.
   * Endpoint: GET /api/admin/users/activity-logs
   * Query params: page, limit, user_id
   *
   * Features:
   * - Pagination: page (default 1) and limit (default 20, max 100)
   * - Optional user filter: Filter logs by specific user ID
   * - Includes user information in each log entry
   * - Sorted by event time (newest first)
   * - Security: Requires ADMIN role and valid JWT
   *
   * Message: "User activity logs retrieved successfully"
   */
  @Get('activity-logs')
  @ApiResponse({
    status: 200,
    description:
      'User activity logs retrieved successfully. Returns paginated list of activity logs with user information.',
    example: RESPONSES.listUserActivityLogsSuccess,
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
  async listUserActivityLogs(@Query() query: ListUserActivityLogsDto) {
    return this.userManagementService.listUserActivityLogs(query);
  }

  /**
   * Activate or deactivate a user account.
   * Endpoint: PATCH /api/admin/users/change-activation
   * Body: { user_id: string, is_active: boolean }
   */
  @Patch('change-activation')
  @ApiResponse({
    status: 200,
    description: 'User activation status updated successfully',
    example: RESPONSES.setUserActivationSuccess,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - missing user_id or is_active',
    example: RESPONSES.badRequest,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    example: RESPONSES.userNotFound,
  })
  async setUserActivation(@Body() body: SetUserActivationDto) {
    return this.userManagementService.setUserActiveStatus(body);
  }

  /**
   * Get enum options for user management filters.
   * Endpoint: GET /api/admin/users/enums
   *
   * Features:
   * - Returns all enum values used in ListUsersDto in label/value format
   * - Used by frontend to populate filter dropdowns
   * - Includes sort fields, sort orders, account statuses, onboarding statuses, and genders
   * - Security: Requires ADMIN role and valid JWT
   *
   * Message: "Enum options retrieved successfully"
   */
  @Get('enums')
  @ApiResponse({
    status: 200,
    description:
      'Enum options retrieved successfully. Returns all enum values in label/value format for frontend filter dropdowns.',
    example: RESPONSES.userManagementEnumsSuccess,
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
  getUserManagementEnums() {
    return this.userManagementService.getUserManagementEnums();
  }

  /**
   * Get user detail with related data.
   * Endpoint: GET /api/admin/users/:id
   * Route params: id (user UUID)
   *
   * Features:
   * - Returns complete user profile
   * - Includes ALL user documents
   * - Includes LATEST user summary (1 record max)
   * - Includes user match analytics (success/reject rates)
   * - Comprehensive user overview in single request
   * - Security: Requires ADMIN role and valid JWT
   *
   * Message: "User details retrieved successfully"
   */
  @Get(':id')
  @ApiResponse({
    status: 200,
    description: `${USER_MANAGEMENT_CONSTANTS.MESSAGES.DETAIL_SUCCESS}. Returns user + all documents + latest summary + match analytics`,
    example: RESPONSES.userDetailSuccess,
  })
  @ApiResponse({
    status: 404,
    description: `${USER_MANAGEMENT_CONSTANTS.MESSAGES.USER_NOT_FOUND}`,
    example: RESPONSES.userNotFound,
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
  async getUserDetail(@Param() params: UserDetailDto) {
    return this.userManagementService.getUserDetail(params.id);
  }
}
