/**
 * User Management Enums & Constants
 * ==================================
 * Purpose:
 * - Centralized enums for user management filtering and sorting.
 * - Used by UserManagementController and UserManagementService.
 * - Provides type-safe options for API query parameters.
 *
 * Exported Enums:
 * - UserSortFieldEnum: Available fields to sort by
 * - SortOrderEnum: Sort direction (ASC/DESC)
 * - AccountStatusEnum: Active/Inactive account filter
 * - OnboardingStatusFilterEnum: Onboarding progress states
 * - GenderFilterEnum: Gender filter options
 */

/**
 * UserSortFieldEnum
 * -----------------
 * Allowed fields for sorting user lists.
 * Used in ListUsersDto.sort query parameter.
 *
 * Examples:
 * - sort=created_at&order=DESC (newest first)
 * - sort=first_name&order=ASC (alphabetical)
 * - sort=updated_at&order=DESC (recently updated)
 */
export enum UserSortFieldEnum {
  CREATED_AT = 'created_at',
  UPDATED_AT = 'updated_at',
  FIRST_NAME = 'first_name',
  LAST_NAME = 'last_name',
  EMAIL = 'email',
  AGE = 'age',
}

/**
 * SortOrderEnum
 * -----------
 * Direction for sorting results.
 * Used in ListUsersDto.order query parameter.
 */
export enum SortOrderEnum {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * AccountStatusEnum
 * ----------------
 * Filter users by account activation status.
 * Used in ListUsersDto.account_status query parameter.
 *
 * - ACTIVE: User account is active (is_active = true)
 * - INACTIVE: User account is inactive/deactivated (is_active = false)
 */
export enum AccountStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * OnboardingStatusFilterEnum
 * -------------------------
 * Filter users by onboarding completion status.
 * Used in ListUsersDto.onboarding_status query parameter.
 *
 * - NOT_STARTED: User hasn't begun onboarding
 * - IN_PROGRESS: User is currently completing onboarding
 * - COMPLETED: User has completed all onboarding steps
 */
export enum OnboardingStatusFilterEnum {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

/**
 * GenderFilterEnum
 * ---------------
 * Filter users by gender.
 * Used in ListUsersDto.gender query parameter.
 */
export enum GenderFilterEnum {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

/**
 * User Management Constants
 * ========================
 * Fixed values for API behavior.
 */
export const USER_MANAGEMENT_CONSTANTS = {
  // Pagination limits
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT_LIST: 100, // Maximum items per page for list endpoint
  MAX_LIMIT_SEARCH: 20, // Maximum results for search (no pagination)

  // Detail endpoint limits
  MAX_DOCUMENTS: undefined, // No limit - return all documents
  MAX_SUMMARY_RECORDS: 1, // Return only latest summary
  MAX_ACTIVITY_LOGS: 5, // Return only last 5 activity logs

  // Search parameters
  DEFAULT_SEARCH_LIMIT: 20,

  // API messages
  MESSAGES: {
    LIST_SUCCESS: 'Users retrieved successfully',
    SEARCH_SUCCESS: 'User search completed',
    DETAIL_SUCCESS: 'User details retrieved successfully',
    USER_NOT_FOUND: 'User not found',
    INVALID_SORT_FIELD: 'Invalid sort field',
    INVALID_SORT_ORDER: 'Invalid sort order',
    INVALID_PAGE: 'Invalid page number',
    INVALID_LIMIT: 'Invalid limit',
    SEARCH_QUERY_REQUIRED: 'Search query is required',
  },

  // Description messages for Swagger
  DESCRIPTIONS: {
    SORT_FIELD:
      'Field to sort results by. Options: created_at (creation date), updated_at (modification date), first_name, last_name, email, age',
    SORT_ORDER:
      'Sort direction. ASC (ascending/alphabetical/oldest first) or DESC (descending/reverse alphabetical/newest first)',
    ACCOUNT_STATUS:
      'Filter by account status. active (user account is enabled), inactive (user account is disabled/deactivated)',
    ONBOARDING_STATUS:
      'Filter by onboarding progress. not_started (user has not begun), in_progress (user is completing), completed (all steps done)',
    GENDER: 'Filter by gender. male, female, or other',
    PAGE: 'Page number starting from 1. Each page contains up to the specified limit of results.',
    LIMIT:
      'Number of results per page. Default is 20, maximum is 100. Cannot exceed 100 even if higher value provided.',
    SEARCH:
      'Search term to find users by name or email (case-insensitive, partial matches supported)',
    SEARCH_LIMIT:
      'Maximum number of search results to return. Default is 20, capped at 20 (no pagination for search results)',
  },
};
