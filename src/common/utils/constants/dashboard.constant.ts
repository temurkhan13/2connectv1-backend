/**
 * Dashboard Enums & Constants
 * ===========================
 * Purpose:
 * - Centralized enums for dashboard statistics filtering.
 * - Used by DashboardController and DashboardService.
 * - Provides type-safe options for API query parameters.
 *
 * Exported Enums:
 * - StatisticsVisibilityEnum: Period type for statistics (week/month)
 */

/**
 * StatisticsVisibilityEnum
 * ----------------------
 * Period type for user signup statistics.
 * Used in UserSignupStatisticsDto.visibility query parameter.
 *
 * Examples:
 * - visibility=week (last 6 weeks, default)
 * - visibility=month (last 6 months)
 */
export enum StatisticsVisibilityEnum {
  WEEK = 'week',
  MONTH = 'month',
}

// Dashboard API messages and descriptions
export const DASHBOARD_CONSTANTS = {
  DEFAULT_STATISTICS_VISIBILITY: StatisticsVisibilityEnum.WEEK,

  MESSAGES: {
    COUNTS_SUCCESS: 'Dashboard counts retrieved successfully',
    SIGNUP_STATISTICS_SUCCESS: 'User signup statistics retrieved successfully',
  },

  DESCRIPTIONS: {
    VISIBILITY: 'Period type for statistics. week (last 6 weeks, default) or month (last 6 months)',
  },
};
