import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col } from 'sequelize';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';
import { StatsVisibilityDto } from 'src/modules/super-admin/dashboard/dto/stats-visibility.dto';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { RoleEnum } from 'src/common/enums';
import { OnboardingStatusEnum } from 'src/common/enums';
import { makeLabelForEnums } from 'src/common/utils/enum.helper';
import { StatisticsVisibilityEnum } from 'src/common/utils/constants/dashboard.constant';
import { DayjsHelper } from 'src/common/utils/dayjs.helper';

/**
 * DashboardService
 * ----------------
 * Purpose:
 * - Handle dashboard-related operations for super-admin.
 *
 * Summary:
 * - Provides counts for users and summaries.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(Match) private readonly matchModel: typeof Match,
    @InjectModel(UserSummaries) private readonly userSummariesModel: typeof UserSummaries,
    @InjectModel(AiConversation) private readonly aiConversationModel: typeof AiConversation,
  ) {}

  /**
   * Get dashboard counts.
   * Summary:
   * - Returns total users (excluding admins), active users, and AI Generated Summaries.
   *
   * Returns: Array of { label: string, value: number }
   */
  async getDashboardCounts() {
    // Total users excluding admins
    const totalUsers = await this.userModel.count({
      where: { '$role.title$': { [Op.ne]: RoleEnum.ADMIN } },
      include: [{ association: 'role', required: true }],
    });

    // Active users excluding admins
    const activeUsers = await this.userModel.count({
      where: {
        is_active: true,
        '$role.title$': { [Op.ne]: RoleEnum.ADMIN },
      },
      include: [{ association: 'role', required: true }],
    });

    // AI Generated Summaries
    const totalSummaries = await this.userSummariesModel.count();

    this.logger.debug(
      `Dashboard counts: totalUsers=${totalUsers}, activeUsers=${activeUsers}, totalSummaries=${totalSummaries}`,
    );

    return [
      { label: 'Total Users', value: totalUsers },
      { label: 'Active Users', value: activeUsers },
      { label: 'AI Generated Summaries', value: totalSummaries },
    ];
  }

  /**
   * Get user signup statistics.
   * Summary:
   * - Returns user signup counts for the last 6 periods (weeks or months).
   * - Excludes admin users.
   * - Week1/Month1 = most recent period, Week6/Month6 = oldest period.
   *
   * Params:
   * - filters: 'week' (default) or 'month'
   *
   * Returns: Array of { label: string, value: number }
   */
  async getUserSignupStatistics(filters: StatsVisibilityDto) {
    const { visibility = StatisticsVisibilityEnum.WEEK } = filters ?? {};
    const signupsData: { label: string; value: number }[] = [];
    const periods = 6;

    // Get date ranges based on visibility mode
    const dateRanges =
      visibility === StatisticsVisibilityEnum.WEEK
        ? DayjsHelper.getLastNWeeks(periods)
        : DayjsHelper.getLastNMonths(periods);

    // Fetch counts for each period
    for (let i = 0; i < dateRanges.length; i++) {
      const { startDate, endDate } = dateRanges[i];

      const count = await this.userModel.count({
        where: {
          created_at: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
          '$role.title$': { [Op.ne]: RoleEnum.ADMIN },
        },
        include: [{ association: 'role', required: true }],
      });

      const label = `${visibility === StatisticsVisibilityEnum.WEEK ? 'Week' : 'Month'} ${i + 1}`;
      signupsData.push({ label, value: count });
    }

    this.logger.debug(
      `User signup statistics (${visibility}): ${signupsData
        .map(d => `${d.label}=${d.value}`)
        .join(', ')}`,
    );

    return signupsData;
  }

  /**
   * Get user onboarding statistics.
   * Summary:
   * - Returns onboarding counts grouped by onboarding_status.
   * - Excludes admin users.
   *
   * Returns: Array of { status: string, count: number, label: string }
   */
  async getUserOnboardingStatistics() {
    const rows = (await this.userModel.count({
      where: {
        '$role.title$': { [Op.ne]: RoleEnum.ADMIN },
      },
      include: [{ association: 'role', required: true }],
      group: ['onboarding_status'],
    })) as unknown[];

    const lookup: Record<string, number> = {};
    (rows as any[]).forEach(r => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const key = String(r.onboarding_status ?? r['onboarding_status'] ?? '');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const val = Number(r.count ?? r['count'] ?? 0);
      if (key) lookup[key] = val;
    });

    const statuses = Object.values(OnboardingStatusEnum);
    const results: { status: string; label: string; count: number }[] = statuses.map(s => ({
      status: s,
      label: makeLabelForEnums(s),
      count: lookup[s] ?? 0,
    }));

    const debugStr = results.map(d => `${d.status}=${d.count}`).join(', ');
    this.logger.debug(`User onboarding statistics (grouped by status): ${debugStr}`);

    return results;
  }

  /**
   * Get common core objectives statistics.
   * Summary:
   * - Aggregates users.objective and returns counts per objective value.
   * - Excludes admin users.
   * Returns: Array of { label: string, count: number }
   */
  async getCommonCoreObjectivesStats() {
    const rows = (await this.userModel.findAll({
      attributes: ['objective', [fn('COUNT', col('objective')), 'count']],
      where: {
        objective: { [Op.ne]: null },
        '$role.title$': { [Op.ne]: RoleEnum.ADMIN },
      },
      include: [{ association: 'role', required: true, attributes: [] }],
      group: ['objective'],
      order: [[fn('COUNT', col('objective')), 'DESC']],
      raw: true,
    })) as unknown[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (rows as any[]).map(r => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      label: String(r.objective ?? ''),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      count: Number(r.count ?? 0),
    }));

    this.logger.debug(
      `Common core objectives stats: ${results.map(d => `${d.label}=${d.count}`).join(', ')}`,
    );
    return results;
  }

  /**
   * Get match acceptance/rejection rates aggregated over the last 6 periods.
   * - visibility: 'week' | 'month' (defaults to week)
   * - Aggregates matches.created_at across the last 6 weeks/months (most recent first)
   * - Excludes matches involving admin users
   * Returns: Array of { status: string, label: string, count: number, percent: number }
   */
  async getMatchAcceptanceRates(filters: StatsVisibilityDto) {
    const { visibility = StatisticsVisibilityEnum.WEEK } = filters ?? {};
    const periods = 6;

    const dateRanges =
      visibility === StatisticsVisibilityEnum.WEEK
        ? DayjsHelper.getLastNWeeks(periods)
        : DayjsHelper.getLastNMonths(periods);

    // Combine the range: from oldest start to most recent end
    const oldest = dateRanges[dateRanges.length - 1];
    const newest = dateRanges[0];

    const rows = (await this.matchModel.findAll({
      attributes: ['status', [fn('COUNT', col('status')), 'count']],
      where: {
        created_at: { [Op.gte]: oldest.startDate, [Op.lte]: newest.endDate },
      },
      // exclude matches that include admin users by joining both user sides but
      // avoid selecting their columns (attributes: []) so GROUP BY remains valid
      include: [
        {
          model: this.userModel,
          as: 'userA',
          required: true,
          attributes: [],
          include: [
            {
              association: 'role',
              required: true,
              attributes: [],
              where: { title: { [Op.ne]: RoleEnum.ADMIN } },
            },
          ],
        },
        {
          model: this.userModel,
          as: 'userB',
          required: true,
          attributes: [],
          include: [
            {
              association: 'role',
              required: true,
              attributes: [],
              where: { title: { [Op.ne]: RoleEnum.ADMIN } },
            },
          ],
        },
      ],
      group: ['status'],
      order: [[fn('COUNT', col('status')), 'DESC']],
      raw: true,
    })) as unknown[];

    // Build lookup for all possible statuses
    const lookup: Record<string, number> = {};
    (rows as any[]).forEach(r => {
      const key = String(r.status ?? r['status'] ?? '');
      const val = Number(r.count ?? r['count'] ?? 0);
      if (key) lookup[key] = val;
    });

    const statuses = ['pending', 'approved', 'declined'];
    const total = statuses.reduce((s, st) => s + (lookup[st] ?? 0), 0);

    const results = statuses.map(s => ({
      status: s,
      label: makeLabelForEnums(s),
      count: lookup[s] ?? 0,
      percent: total > 0 ? Math.round(((lookup[s] ?? 0) / total) * 10000) / 100 : 0,
    }));

    this.logger.debug(
      `Match acceptance rates (${visibility} - ${oldest.label}..${newest.label}): ${results
        .map(r => `${r.status}=${r.count}`)
        .join(', ')}`,
    );

    return results;
  }

  /**
   * Get AI conversation success metrics.
   * Summary:
   * - Returns conversation counts for each week/month with 3 metrics:
   *   1. Successful AI-to-AI Alignments (total conversations)
   *   2. Conversations Marked as Rejected (AI-to-AI only)
   *   3. Human Intervention (user-to-user conversations)
   * - Supports time-based filtering: week (last 6 weeks) or month (last 6 months)
   *
   * Params:
   * - filters: { visibility: 'week' | 'month' }
   *
   * Returns: Array of { label: string, data: Array<{ label: string, value: number }> }
   */
  async getAiConversationSuccessMetrics(filters: StatsVisibilityDto) {
    const { visibility = StatisticsVisibilityEnum.WEEK } = filters ?? {};
    const periods = 6;

    // Get date ranges based on visibility mode
    const dateRanges =
      visibility === StatisticsVisibilityEnum.WEEK
        ? DayjsHelper.getLastNWeeks(periods)
        : DayjsHelper.getLastNMonths(periods);

    this.logger.debug(`Date ranges (${visibility}):`, JSON.stringify(dateRanges, null, 2));

    // Initialize result arrays for each metric
    const alignmentsData: { label: string; value: number }[] = [];
    const rejectedData: { label: string; value: number }[] = [];
    const interventionData: { label: string; value: number }[] = [];

    // Fetch counts for each period
    for (let i = 0; i < dateRanges.length; i++) {
      const { startDate, endDate } = dateRanges[i];
      const label = `${visibility === StatisticsVisibilityEnum.WEEK ? 'Week' : 'Month'} ${i + 1}`;

      // Total conversations in this period
      const totalCount = await this.aiConversationModel.count({
        where: {
          created_at: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
        },
      });

      // Rejected conversations (AI-to-AI only)
      const rejectedCount = await this.aiConversationModel.count({
        where: {
          user_to_user_conversation: false,
          created_at: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
        },
      });

      // Completed conversations (user-to-user = Human Intervention)
      const completedCount = await this.aiConversationModel.count({
        where: {
          user_to_user_conversation: true,
          created_at: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
        },
      });

      alignmentsData.push({ label, value: totalCount });
      rejectedData.push({ label, value: rejectedCount });
      interventionData.push({ label, value: completedCount });

      this.logger.debug(
        `${label}: total=${totalCount}, rejected=${rejectedCount}, completed=${completedCount} (${DayjsHelper.format(
          startDate,
        )} to ${DayjsHelper.format(endDate)})`,
      );
    }

    const result = [
      { label: 'Successful AI-to-AI Alignments', data: alignmentsData },
      { label: 'Conversations Marked as Rejected', data: rejectedData },
      { label: 'Human Intervention', data: interventionData },
    ];

    this.logger.debug(
      `AI conversation success metrics (${visibility}): ${result
        .map(r => `${r.label}=${r.data.map(d => d.value).join(',')}`)
        .join(' | ')}`,
    );

    return result;
  }
}
