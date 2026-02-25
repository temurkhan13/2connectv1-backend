import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { RoleEnum, MatchStatusEnum } from 'src/common/enums';
import {
  AccountStatusEnum,
  GenderFilterEnum,
  OnboardingStatusFilterEnum,
  SortOrderEnum,
  UserSortFieldEnum,
} from 'src/common/utils/constants/user-management.constant';
import {
  calculateAge,
  capitalizeFirstLetter,
  formatAccountStatus,
  formatOnboardingStatus,
} from 'src/common/utils/formatting.util';
import { ListUserActivityLogsDto } from 'src/modules/super-admin/user-management/dto/list-user-activity-logs.dto';
import { ListUsersDto } from 'src/modules/super-admin/user-management/dto/list-users.dto';
import { SearchUsersDto } from 'src/modules/super-admin/user-management/dto/search-users.dto';
import { SetUserActivationDto } from 'src/modules/super-admin/user-management/dto/set-user-activation.dto';

/**
 * UserManagementService
 * ---------------------
 * Purpose:
 * - Handle admin user management operations: listing, searching, detailed views.
 *
 * Summary:
 * - List users with pagination, filtering, and sorting.
 * - Search users by name/email (basic info only, max 20 results).
 * - Get detailed user view with documents and summary.
 *
 * Key responsibilities:
 * - Query optimization with eager loading.
 * - Filtering and search on name + email.
 * - Pagination with offset/limit.
 * - Return structured user data for admin dashboard.
 */
@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);

  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(UserDocument) private readonly userDocumentModel: typeof UserDocument,
    @InjectModel(UserSummaries) private readonly userSummariesModel: typeof UserSummaries,
    @InjectModel(UserActivityLog) private readonly userActivityLogModel: typeof UserActivityLog,
    @InjectModel(Match) private readonly matchModel: typeof Match,
  ) {}

  /**
   * List users with pagination, filtering, and sorting.
   * Summary:
   * - Returns paginated list of users with basic info.
   * - EXCLUDES admin users - only shows regular (USER role) users.
   * - Supports filtering by onboarding_status, is_active, gender.
   * - Supports searching on name/email combination.
   * - Supports sorting by created_at, updated_at, first_name, email.
   *
   * Inputs: dto with page, limit, sort, order, search, filters.
   * Returns: { data: User[], total: number, page: number, limit: number, totalPages: number }.
   */
  async listUsers(dto: ListUsersDto) {
    const {
      page = 1,
      limit = 10,
      sort = 'created_at',
      order = 'DESC',
      search,
      onboarding_status,
      account_status,
      gender,
    } = dto;

    // Validate limit (max 100)
    const validLimit = Math.min(limit, 100);
    const offset = (page - 1) * validLimit;

    // Build where clause - exclude admin users by filtering on role title
    const where: Record<string, unknown> = {
      '$role.title$': { [Op.ne]: RoleEnum.ADMIN },
    };

    // Search filter (name or email)
    if (search) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const whereObj = where as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      whereObj[Op.or] = [
        Sequelize.where(
          Sequelize.fn('CONCAT', Sequelize.col('first_name'), ' ', Sequelize.col('last_name')),
          Op.iLike,
          `%${search}%`,
        ),
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Status filters
    if (onboarding_status) {
      where.onboarding_status = onboarding_status;
    }

    // Handle account status filter (string comparison from DTO)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((account_status as any) === 'active') {
      where.is_active = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if ((account_status as any) === 'inactive') {
      where.is_active = false;
    }

    if (gender) {
      where.gender = gender;
    }

    // Execute query with pagination and join to Role table
    const { count, rows } = await this.userModel.findAndCountAll({
      where,
      attributes: [
        'id',
        'first_name',
        'last_name',
        'email',
        'gender',
        'date_of_birth',
        'onboarding_status',
        'is_active',
        'created_at',
        'updated_at',
      ],
      include: [{ association: 'role', required: true }],
      order: [[sort, order]],
      limit: validLimit,
      offset,
      subQuery: false,
    });

    const totalPages = Math.ceil(count / validLimit);

    // Map to simplified response format
    const formattedData = rows.map(user => ({
      id: user.id,
      full_name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      gender: user.gender ? capitalizeFirstLetter(user.gender) : null,
      age: user.date_of_birth ? calculateAge(user.date_of_birth) : null,
      onboarding_status: user.onboarding_status
        ? formatOnboardingStatus(user.onboarding_status)
        : null,
      account_status: formatAccountStatus(user.is_active),
      created_at: user.created_at,
      updated_at: user.updated_at,
    }));

    this.logger.debug(`Listed users - Page: ${page}, Total: ${count} (excluding admins)`);

    return {
      data: formattedData,
      total: count,
      page,
      limit: validLimit,
      totalPages,
    };
  }

  /**
   * Search users by name/email (basic info only).
   * Summary:
   * - Returns max 20 results (no pagination).
   * - EXCLUDES admin users - only shows regular (USER role) users.
   * - Returns only: id, first_name, last_name, email, gender, age.
   * - Search on name (full name concat) or email (case-insensitive).
   *
   * Inputs: dto with query and optional limit.
   * Returns: { data: User[], total: number }.
   */
  async searchUsers(dto: SearchUsersDto) {
    const { query, limit = 20 } = dto;

    const validLimit = Math.min(limit, 20);

    // Build where clause - exclude admin users by filtering on role title
    const where: Record<string, unknown> = {
      '$role.title$': { [Op.ne]: RoleEnum.ADMIN },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const whereObj = where as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    whereObj[Op.or] = [
      Sequelize.where(
        Sequelize.fn('CONCAT', Sequelize.col('first_name'), ' ', Sequelize.col('last_name')),
        Op.iLike,
        `%${query}%`,
      ),
      { email: { [Op.iLike]: `%${query}%` } },
    ];

    const results = await this.userModel.findAll({
      where,
      attributes: [
        'id',
        'first_name',
        'last_name',
        'email',
        'gender',
        'date_of_birth',
        'onboarding_status',
        'is_active',
        'created_at',
        'updated_at',
      ],
      include: [{ association: 'role', required: true }],
      limit: validLimit,
      subQuery: false,
    });

    this.logger.debug(
      `Searched users with query: "${query}", results: ${results.length} (excluding admins)`,
    );

    // Map to simplified response format
    const formattedData = results.map(user => ({
      id: user.id,
      full_name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      gender: user.gender ? capitalizeFirstLetter(user.gender) : null,
      age: user.date_of_birth ? calculateAge(user.date_of_birth) : null,
      onboarding_status: user.onboarding_status
        ? formatOnboardingStatus(user.onboarding_status)
        : null,
      account_status: formatAccountStatus(user.is_active),
      created_at: user.created_at,
      updated_at: user.updated_at,
    }));

    return {
      data: formattedData,
      total: results.length,
    };
  }

  /**
   * Get detailed user information.
   * Summary:
   * - Returns full user info with related data.
   * - EXCLUDES admin users - cannot view admin user details.
   * - Includes: User profile, all documents, latest summary (1 record), match analytics.
   *
   * Inputs: userId (UUID).
   * Returns: User with documents, summary, and match analytics.
   * Throws: NotFoundException if user not found or is an admin.
   */
  async getUserDetail(userId: string) {
    // Fetch main user with role information
    const user = await this.userModel.findByPk(userId, {
      include: [{ association: 'role', required: true }],
    });

    if (!user) {
      this.logger.warn(`User detail not found: ${userId}`);
      throw new NotFoundException('User not found');
    }

    // Check if user is admin - if so, reject the request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    if ((user.role as any)?.title === RoleEnum.ADMIN) {
      this.logger.warn(`Access denied: Attempted to view admin user details: ${userId}`);
      throw new NotFoundException('User not found');
    }

    // Fetch user documents (all)
    const documents = await this.userDocumentModel.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });

    // Fetch latest user summary (1 record only)
    const summary = await this.userSummariesModel.findOne({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });

    // Calculate match analytics
    const matchAnalytics = await this.calculateMatchAnalytics(userId);

    this.logger.debug(`Fetched user detail: ${userId}`);

    // Format user data
    const formattedUser = {
      id: user.id,
      full_name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      gender: user.gender ? capitalizeFirstLetter(user.gender) : null,
      age: user.date_of_birth ? calculateAge(user.date_of_birth) : null,
      date_of_birth: user.date_of_birth,
      bio: user.bio || null,
      objective: user.objective || null,
      avatar: user.avatar || null,
      linkedin_profile: user.linkedin_profile || null,
      onboarding_status: user.onboarding_status
        ? formatOnboardingStatus(user.onboarding_status)
        : null,
      is_active: user.is_active,
      account_status: formatAccountStatus(user.is_active),
      is_email_verified: user.is_email_verified,
      email_notifications: user.email_notifications,
      allow_matching: user.allow_matching,
      timezone: user.timezone || null,
      last_login_at: user.last_login_at || null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    // Format documents
    const formattedDocuments = documents.map(doc => ({
      id: doc.id,
      user_id: doc.user_id,
      document_url: doc.url,
      document_type: doc.type || null,
      parsed_metadata: doc.parsed_metadata || null,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }));

    // Format summary
    const formattedSummary = summary
      ? {
          id: summary.id,
          user_id: summary.user_id,
          summary_text: summary.summary,
          status: summary.status || null,
          version: summary.version || null,
          created_at: summary.created_at,
          updated_at: summary.updated_at,
        }
      : null;

    return {
      user: formattedUser,
      documents: formattedDocuments,
      summary: formattedSummary,
      match_analytics: matchAnalytics,
    };
  }

  /**
   * List user activity logs with pagination.
   * Summary:
   * - Returns paginated list of user activity logs.
   * - Can filter by specific user or return all logs.
   * - Includes user information in the response.
   *
   * Inputs: dto with pagination and optional user filter.
   * Returns: { data: ActivityLog[], total: number, page: number, limit: number, totalPages: number }.
   */
  async listUserActivityLogs(dto: ListUserActivityLogsDto) {
    const { page = 1, limit = 20, user_id } = dto;

    // Validate limit (max 100)
    const validLimit = Math.min(limit, 100);
    const offset = (page - 1) * validLimit;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (user_id) {
      where.user_id = user_id;
    }

    // Execute query with pagination and join to User table
    const { count, rows } = await this.userActivityLogModel.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false,
        },
      ],
      order: [['event_time', 'DESC']],
      limit: validLimit,
      offset,
    });

    const totalPages = Math.ceil(count / validLimit);

    // Map to response format
    const formattedData = rows.map(log => ({
      id: log.id,
      user_id: log.user_id,
      user: log.user
        ? {
            id: log.user.id,
            full_name: `${log.user.first_name} ${log.user.last_name}`,
            email: log.user.email,
          }
        : null,
      event_type: log.event_type,
      event_time: log.event_time,
      metadata: log.metadata || null,
      created_at: log.created_at,
    }));

    this.logger.debug(
      `Listed user activity logs - Page: ${page}, Total: ${count}${
        user_id ? `, User: ${user_id}` : ''
      }`,
    );

    return {
      data: formattedData,
      total: count,
      page,
      limit: validLimit,
      totalPages,
    };
  }

  /**
   * Get enum options for user management filters.
   * Summary:
   * - Returns all enum values used in ListUsersDto in label/value format.
   * - Used by frontend to populate filter dropdowns.
   *
   * Returns: Object with enum arrays in {label, value} format.
   */
  getUserManagementEnums() {
    return {
      sort_fields: Object.values(UserSortFieldEnum).map((value: string) => ({
        label: value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
      })),
      sort_orders: Object.values(SortOrderEnum).map((value: string) => ({
        label: value.toUpperCase(),
        value,
      })),
      account_statuses: Object.values(AccountStatusEnum).map((value: string) => ({
        label: value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
      })),
      onboarding_statuses: Object.values(OnboardingStatusFilterEnum).map((value: string) => ({
        label: value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
      })),
      genders: Object.values(GenderFilterEnum).map((value: string) => ({
        label: value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
      })),
    };
  }

  /**
   * Activate or deactivate a user account.
   * Inputs: Dto with user_id and is_active flag.
   * Returns: formatted user object (same shape as getUserDetail().user)
   * Throws: NotFoundException if user not found or is admin
   */
  async setUserActiveStatus(data: SetUserActivationDto) {
    const { user_id: userId, is_active: isActive } = data;

    const user = await this.userModel.findByPk(userId, {
      include: [{ association: 'role', required: true }],
    });

    if (!user) {
      this.logger.warn(`User not found for activation: ${userId}`);
      throw new NotFoundException('User not found');
    }

    // Prevent toggling admin users
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    if ((user.role as any)?.title === RoleEnum.ADMIN) {
      this.logger.warn(`Attempt to change activation for admin user: ${userId}`);
      throw new NotFoundException('User not found');
    }

    // Update is_active flag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await (user as any).update({ is_active: isActive });

    // Return formatted user (minimal fields matching getUserDetail.user)
    const formattedUser = {
      id: user.id,
      full_name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      gender: user.gender ? capitalizeFirstLetter(user.gender) : null,
      age: user.date_of_birth ? calculateAge(user.date_of_birth) : null,
      date_of_birth: user.date_of_birth,
      bio: user.bio || null,
      objective: user.objective || null,
      avatar: user.avatar || null,
      linkedin_profile: user.linkedin_profile || null,
      onboarding_status: user.onboarding_status
        ? formatOnboardingStatus(user.onboarding_status)
        : null,
      is_active: isActive,
      account_status: formatAccountStatus(isActive),
      is_email_verified: user.is_email_verified,
      email_notifications: user.email_notifications,
      allow_matching: user.allow_matching,
      timezone: user.timezone || null,
      last_login_at: user.last_login_at || null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    this.logger.debug(`Set user active status: ${userId} -> ${isActive}`);

    return { user: formattedUser };
  }

  /**
   * Calculate match analytics for a user.
   * Returns success rate and reject rate as percentages.
   */
  private async calculateMatchAnalytics(userId: string) {
    // Count approved decisions by this user
    const approvedCount = await this.matchModel.count({
      where: {
        [Op.or]: [
          { user_a_id: userId, user_a_decision: MatchStatusEnum.APPROVED },
          { user_b_id: userId, user_b_decision: MatchStatusEnum.APPROVED },
        ],
      },
    });

    // Count declined decisions by this user
    const declinedCount = await this.matchModel.count({
      where: {
        [Op.or]: [
          { user_a_id: userId, user_a_decision: MatchStatusEnum.DECLINED },
          { user_b_id: userId, user_b_decision: MatchStatusEnum.DECLINED },
        ],
      },
    });

    const totalDecisions = approvedCount + declinedCount;

    // Calculate percentages (keep decimal precision)
    const successRate =
      totalDecisions > 0 ? Number(((approvedCount / totalDecisions) * 100).toFixed(1)) : 0;
    const rejectRate =
      totalDecisions > 0 ? Number(((declinedCount / totalDecisions) * 100).toFixed(1)) : 0;

    return [
      {
        label: 'User Match Success Rate',
        value: successRate,
      },
      {
        label: 'User Match Reject Rate',
        value: rejectRate,
      },
    ];
  }
}
