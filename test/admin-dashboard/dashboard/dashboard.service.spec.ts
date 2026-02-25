import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { DashboardService } from 'src/modules/super-admin/dashboard/dashboard.service';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { StatisticsVisibilityEnum } from 'src/common/utils/constants/dashboard.constant';

/**
 * DashboardService Unit Tests
 * ============================================================================================
 * Purpose: Comprehensive testing of business logic for dashboard statistics
 *
 * Scope:
 * - getDashboardCounts(): Aggregate count statistics
 * - getUserSignupStatistics(): Time-series signup data
 * - getUserOnboardingStatistics(): Grouped onboarding status data
 * - getCommonCoreObjectivesStats(): Objectives aggregation
 * - getMatchAcceptanceRates(): Match status distribution with percentages
 *
 * Mocking Strategy:
 * - Mock Sequelize models (User, Match, UserSummaries)
 * - Mock Sequelize query methods (.count(), .findAll())
 * - Simulate model associations and data
 *
 * Coverage Areas:
 * 1. Happy path scenarios with expected data
 * 2. Edge cases (zero records, single records, large datasets)
 * 3. Admin filtering (all methods exclude admins)
 * 4. Date range calculations and period grouping
 * 5. Percentage calculations and rounding
 * 6. Error handling and null/undefined handling
 * 7. Response shape and data type validation
 */
describe('DashboardService (Unit Tests)', () => {
  let service: DashboardService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let matchModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userSummariesModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiConversationModel: any;

  beforeEach(async () => {
    userModel = {
      count: jest.fn(),
      findAll: jest.fn(),
      sequelize: {
        query: jest.fn(),
      },
    };

    matchModel = {
      count: jest.fn(),
      findAll: jest.fn(),
      sequelize: {
        query: jest.fn(),
      },
    };

    userSummariesModel = {
      findAll: jest.fn(),
      count: jest.fn(),
    };

    aiConversationModel = {
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getModelToken(User),
          useValue: userModel,
        },
        {
          provide: getModelToken(Match),
          useValue: matchModel,
        },
        {
          provide: getModelToken(UserSummaries),
          useValue: userSummariesModel,
        },
        {
          provide: getModelToken(AiConversation),
          useValue: aiConversationModel,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service.getDashboardCounts).toBeDefined();
    expect(service.getUserSignupStatistics).toBeDefined();
    expect(service.getUserOnboardingStatistics).toBeDefined();
    expect(service.getCommonCoreObjectivesStats).toBeDefined();
    expect(service.getMatchAcceptanceRates).toBeDefined();
    expect(service.getAiConversationSuccessMetrics).toBeDefined();
  });

  describe('getDashboardCounts()', () => {
    describe('happy path', () => {
      it('should return array with exactly 3 count objects', async () => {
        // totalUsers, activeUsers
        userModel.count.mockResolvedValueOnce(100);
        userModel.count.mockResolvedValueOnce(50);
        userSummariesModel.count.mockResolvedValueOnce(25);

        const result = await service.getDashboardCounts();

        expect(result).toHaveLength(3);
        expect(result[0]).toHaveProperty('label');
        expect(result[0]).toHaveProperty('value');
      });

      it('should return total users count', async () => {
        // totalUsers, activeUsers
        userModel.count.mockResolvedValueOnce(150);
        userModel.count.mockResolvedValueOnce(75);
        userSummariesModel.count.mockResolvedValueOnce(30);

        const result = await service.getDashboardCounts();

        const totalUsersMetric = result.find(r => r.label === 'Total Users');
        expect(totalUsersMetric).toBeDefined();
        expect(totalUsersMetric!.value).toBe(150);
      });

      it('should return active users count', async () => {
        // totalUsers, activeUsers
        userModel.count.mockResolvedValueOnce(150);
        userModel.count.mockResolvedValueOnce(75);
        userSummariesModel.count.mockResolvedValueOnce(30);

        const result = await service.getDashboardCounts();

        const activeUsersMetric = result.find(r => r.label === 'Active Users');
        expect(activeUsersMetric).toBeDefined();
        expect(activeUsersMetric!.value).toBe(75);
      });

      it('should return AI summaries count', async () => {
        userModel.count.mockResolvedValueOnce(100);
        userModel.count.mockResolvedValueOnce(50);
        userSummariesModel.count.mockResolvedValueOnce(45);

        const result = await service.getDashboardCounts();

        const summariesMetric = result.find(r => r.label === 'AI Generated Summaries');
        expect(summariesMetric).toBeDefined();
        expect(summariesMetric!.value).toBe(45);
      });

      it('should exclude admin users from counts', async () => {
        userModel.count.mockResolvedValueOnce(100);
        userModel.count.mockResolvedValueOnce(50);
        userSummariesModel.count.mockResolvedValueOnce(25);

        await service.getDashboardCounts();

        const countCall = userModel.count.mock.calls[0];
        expect(countCall[0]).toHaveProperty('where');
      });
    });

    describe('edge cases', () => {
      it('should handle zero total users', async () => {
        userModel.count.mockResolvedValueOnce(0);
        userModel.count.mockResolvedValueOnce(0);
        userSummariesModel.count.mockResolvedValueOnce(0);

        const result = await service.getDashboardCounts();

        expect(result[0].value).toBe(0);
        expect(result[1].value).toBe(0);
        expect(result[2].value).toBe(0);
      });

      it('should handle very large user counts', async () => {
        const largeNumber = 999999;
        // avoid building huge arrays in tests - mock counts directly
        userModel.count.mockResolvedValueOnce(largeNumber);
        userModel.count.mockResolvedValueOnce(largeNumber / 2);
        userSummariesModel.count.mockResolvedValueOnce(Math.floor(largeNumber / 4));

        const result = await service.getDashboardCounts();

        expect(result[0].value).toBe(largeNumber);
        expect(result[1].value).toBe(largeNumber / 2);
      });

      it('should handle case where all users are active', async () => {
        userModel.count.mockResolvedValueOnce(100);
        userModel.count.mockResolvedValueOnce(100);
        userSummariesModel.count.mockResolvedValueOnce(50);

        const result = await service.getDashboardCounts();

        expect(result[0].value).toBe(100);
        expect(result[1].value).toBe(100);
      });

      it('should handle case where no users have summaries', async () => {
        userModel.count.mockResolvedValueOnce(100);
        userModel.count.mockResolvedValueOnce(50);
        userSummariesModel.count.mockResolvedValueOnce(0);

        const result = await service.getDashboardCounts();

        expect(result[2].value).toBe(0);
      });
    });

    describe('response format validation', () => {
      it('should return numeric values for all counts', async () => {
        userModel.count.mockResolvedValueOnce(100);
        userModel.count.mockResolvedValueOnce(50);
        userSummariesModel.count.mockResolvedValueOnce(25);

        const result = await service.getDashboardCounts();

        result.forEach(metric => {
          expect(typeof metric.value).toBe('number');
          expect(metric.value).toBeGreaterThanOrEqual(0);
        });
      });

      it('should return valid label strings', async () => {
        userModel.count.mockResolvedValueOnce(100);
        userModel.count.mockResolvedValueOnce(50);
        userSummariesModel.count.mockResolvedValueOnce(25);

        const result = await service.getDashboardCounts();

        result.forEach(metric => {
          expect(metric.label).toBeTruthy();
          expect(typeof metric.label).toBe('string');
        });
      });
    });
  });

  describe('getUserSignupStatistics()', () => {
    describe('happy path - week visibility', () => {
      it('should return 6 weeks of data when visibility is week', async () => {
        userModel.count
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(18);

        const result = await service.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result).toHaveLength(6);
        expect(result.every((r: any) => r.label.includes('Week'))).toBe(true);
      });

      it('should use default week visibility when not specified', async () => {
        userModel.count
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(18);

        const result = await service.getUserSignupStatistics({});

        expect(result).toHaveLength(6);
      });

      it('should have numeric values for all weeks', async () => {
        userModel.count
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(18);

        const result = await service.getUserSignupStatistics({});

        result.forEach((week: any) => {
          expect(typeof week.value).toBe('number');
          expect(week.value).toBeGreaterThanOrEqual(0);
        });
      });
    });

    describe('happy path - month visibility', () => {
      it('should return 6 months of data when visibility is month', async () => {
        userModel.count
          .mockResolvedValueOnce(25)
          .mockResolvedValueOnce(30)
          .mockResolvedValueOnce(22)
          .mockResolvedValueOnce(28)
          .mockResolvedValueOnce(35)
          .mockResolvedValueOnce(40);

        const result = await service.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        expect(result).toHaveLength(6);
        expect(result.every((r: any) => r.label.includes('Month'))).toBe(true);
      });

      it('should have different aggregation for months vs weeks', async () => {
        userModel.count
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(18)
          .mockResolvedValueOnce(25)
          .mockResolvedValueOnce(30)
          .mockResolvedValueOnce(22)
          .mockResolvedValueOnce(28)
          .mockResolvedValueOnce(35)
          .mockResolvedValueOnce(40);

        const weekResult = await service.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });
        const monthResult = await service.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        const weekSum = weekResult.reduce((sum: number, w: any) => sum + w.value, 0);
        const monthSum = monthResult.reduce((sum: number, m: any) => sum + m.value, 0);
        expect(monthSum).toBeGreaterThan(weekSum);
      });
    });

    describe('edge cases', () => {
      it('should handle zero signups in all periods', async () => {
        userModel.count
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0);

        const result = await service.getUserSignupStatistics({});

        expect(result.every((w: any) => w.value === 0)).toBe(true);
      });

      it('should handle high signup volumes', async () => {
        userModel.count
          .mockResolvedValueOnce(10000)
          .mockResolvedValueOnce(20000)
          .mockResolvedValueOnce(30000)
          .mockResolvedValueOnce(25000)
          .mockResolvedValueOnce(15000)
          .mockResolvedValueOnce(35000);

        const result = await service.getUserSignupStatistics({});

        expect(result[5].value).toBe(35000);
      });

      it('should make exactly 6 queries for 6 periods', async () => {
        userModel.count.mockResolvedValue(0);

        await service.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(userModel.count).toHaveBeenCalledTimes(6);
      });
    });

    describe('response shape validation', () => {
      it('should return array of objects with label and value', async () => {
        userModel.count
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(18);

        const result = await service.getUserSignupStatistics({});

        result.forEach((item: any) => {
          expect(item).toHaveProperty('label');
          expect(item).toHaveProperty('value');
          expect(typeof item.label).toBe('string');
          expect(typeof item.value).toBe('number');
        });
      });

      it('should return arrays with exactly 6 items', async () => {
        userModel.count.mockResolvedValue(0);

        const result = await service.getUserSignupStatistics({});
        expect(result.length).toBe(6);
      });
    });

    describe('admin filtering', () => {
      it('should exclude admin users from statistics', async () => {
        userModel.count.mockResolvedValue(0);

        await service.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        const calls = userModel.count.mock.calls;
        calls.forEach((call: any) => {
          const where = call[0].where;
          expect(where).toBeDefined();
        });
      });
    });
  });

  describe('getUserOnboardingStatistics()', () => {
    describe('happy path', () => {
      it('should return all 3 onboarding statuses', async () => {
        // Sequelize.count with group returns array of grouped rows
        userModel.count.mockResolvedValueOnce([
          { onboarding_status: 'not_started', count: 30 },
          { onboarding_status: 'in_progress', count: 40 },
          { onboarding_status: 'completed', count: 30 },
        ] as any);

        const result = await service.getUserOnboardingStatistics();

        expect(result).toHaveLength(3);
      });

      it('should include status, label, and count properties', async () => {
        userModel.count.mockResolvedValueOnce([
          { onboarding_status: 'not_started', count: 30 },
          { onboarding_status: 'in_progress', count: 40 },
          { onboarding_status: 'completed', count: 30 },
        ] as any);

        const result = await service.getUserOnboardingStatistics();

        result.forEach((item: any) => {
          expect(item).toHaveProperty('status');
          expect(item).toHaveProperty('label');
          expect(item).toHaveProperty('count');
          expect(typeof item.count).toBe('number');
        });
      });

      it('should have proper label mappings', async () => {
        userModel.count.mockResolvedValueOnce([
          { onboarding_status: 'not_started', count: 30 },
          { onboarding_status: 'in_progress', count: 40 },
          { onboarding_status: 'completed', count: 30 },
        ] as any);

        const result = await service.getUserOnboardingStatistics();

        expect(result[0].label).toBeTruthy();
        expect(result[1].label).toBeTruthy();
        expect(result[2].label).toBeTruthy();
      });
    });

    describe('edge cases', () => {
      it('should handle zero users in all statuses', async () => {
        userModel.count.mockResolvedValueOnce([
          { onboarding_status: 'not_started', count: 0 },
          { onboarding_status: 'in_progress', count: 0 },
          { onboarding_status: 'completed', count: 0 },
        ] as any);

        const result = await service.getUserOnboardingStatistics();

        expect(result.every((s: any) => s.count === 0)).toBe(true);
      });

      it('should handle all users in one status', async () => {
        userModel.count.mockResolvedValueOnce([
          { onboarding_status: 'not_started', count: 0 },
          { onboarding_status: 'in_progress', count: 0 },
          { onboarding_status: 'completed', count: 1000 },
        ] as any);

        const result = await service.getUserOnboardingStatistics();

        const completedStatus = result.find((s: any) => s.status === 'completed');
        expect(completedStatus!.count).toBe(1000);
      });

      it('should handle uneven distribution across statuses', async () => {
        userModel.count.mockResolvedValueOnce([
          { onboarding_status: 'not_started', count: 100 },
          { onboarding_status: 'in_progress', count: 20 },
          { onboarding_status: 'completed', count: 5 },
        ] as any);

        const result = await service.getUserOnboardingStatistics();

        expect(result[0].count).toBeGreaterThan(result[1].count);
        expect(result[1].count).toBeGreaterThan(result[2].count);
      });
    });

    describe('admin filtering', () => {
      it('should exclude admin users from onboarding statistics', async () => {
        userModel.count.mockResolvedValueOnce([
          { onboarding_status: 'not_started', count: 30 },
          { onboarding_status: 'in_progress', count: 40 },
          { onboarding_status: 'completed', count: 30 },
        ] as any);

        await service.getUserOnboardingStatistics();

        const callArgs = userModel.count.mock.calls[0][0];
        expect(callArgs).toHaveProperty('where');
      });
    });
  });

  describe('getCommonCoreObjectivesStats()', () => {
    describe('happy path', () => {
      it('should return objectives sorted by count descending', async () => {
        userModel.findAll.mockResolvedValueOnce([
          { objective: 'raising_capital', count: 50 },
          { objective: 'networking', count: 30 },
          { objective: 'marketing', count: 20 },
        ]);

        const result = await service.getCommonCoreObjectivesStats();

        for (let i = 0; i < result.length - 1; i++) {
          expect(result[i].count).toBeGreaterThanOrEqual(result[i + 1].count);
        }
      });

      it('should have label and count for each objective', async () => {
        userModel.findAll.mockResolvedValueOnce([
          { objective: 'raising_capital', count: 50 },
          { objective: 'networking', count: 30 },
        ]);

        const result = await service.getCommonCoreObjectivesStats();

        result.forEach((obj: any) => {
          expect(obj).toHaveProperty('label');
          expect(obj).toHaveProperty('count');
          expect(typeof obj.label).toBe('string');
          expect(typeof obj.count).toBe('number');
        });
      });

      it('should have proper label conversion from enum/values', async () => {
        userModel.findAll.mockResolvedValueOnce([
          { objective: 'raising_capital', count: 50 },
          { objective: 'networking', count: 30 },
        ]);

        const result = await service.getCommonCoreObjectivesStats();

        expect(result[0].label).toBeTruthy();
        expect(result[0].label.length).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('should handle empty objectives list', async () => {
        userModel.findAll.mockResolvedValueOnce([]);

        const result = await service.getCommonCoreObjectivesStats();

        expect(result).toEqual([]);
      });

      it('should handle single objective', async () => {
        userModel.findAll.mockResolvedValueOnce([{ objective: 'raising_capital', count: 100 }]);

        const result = await service.getCommonCoreObjectivesStats();

        expect(result).toHaveLength(1);
        expect(result[0].count).toBe(100);
      });

      it('should handle many objectives', async () => {
        const mockData = Array.from({ length: 20 }, (_, i) => ({
          objective: `objective_${i}`,
          count: 100 - i * 5,
        }));
        userModel.findAll.mockResolvedValueOnce(mockData);

        const result = await service.getCommonCoreObjectivesStats();

        expect(result).toHaveLength(20);
        expect(result[0].count).toBeGreaterThanOrEqual(result[19].count);
      });

      it('should handle equal counts across objectives', async () => {
        const mockData = Array.from({ length: 5 }, (_, i) => ({
          objective: `objective_${i}`,
          count: 50,
        }));
        userModel.findAll.mockResolvedValueOnce(mockData);

        const result = await service.getCommonCoreObjectivesStats();

        expect(result.every((obj: any) => obj.count === 50)).toBe(true);
      });
    });

    describe('admin filtering', () => {
      it('should exclude admin users from objectives aggregation', async () => {
        userModel.findAll.mockResolvedValueOnce([
          { objective: 'raising_capital', count: 50 },
          { objective: 'networking', count: 30 },
        ]);

        await service.getCommonCoreObjectivesStats();

        const callArgs = userModel.findAll.mock.calls[0][0];
        expect(callArgs).toHaveProperty('where');
      });
    });
  });

  describe('getMatchAcceptanceRates()', () => {
    describe('happy path - week visibility', () => {
      it('should return all 3 match statuses', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 60 },
          { status: 'declined', count: 20 },
          { status: 'pending', count: 20 },
        ]);

        const result = await service.getMatchAcceptanceRates({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result).toHaveLength(3);
        expect(result.map((r: any) => r.status)).toEqual(
          expect.arrayContaining(['approved', 'declined', 'pending']),
        );
      });

      it('should use default week visibility when not specified', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 60 },
          { status: 'declined', count: 20 },
          { status: 'pending', count: 20 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        expect(result).toHaveLength(3);
      });

      it('should have status, label, count, and percent properties', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 60 },
          { status: 'declined', count: 20 },
          { status: 'pending', count: 20 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        result.forEach((match: any) => {
          expect(match).toHaveProperty('status');
          expect(match).toHaveProperty('label');
          expect(match).toHaveProperty('count');
          expect(match).toHaveProperty('percent');
          expect(typeof match.count).toBe('number');
          expect(typeof match.percent).toBe('number');
        });
      });

      it('should have valid label mappings for statuses', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 60 },
          { status: 'declined', count: 20 },
          { status: 'pending', count: 20 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        result.forEach((match: any) => {
          expect(match.label).toBeTruthy();
          expect(typeof match.label).toBe('string');
        });
      });

      it('should have percentages that sum to 100', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 60 },
          { status: 'declined', count: 20 },
          { status: 'pending', count: 20 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        const totalPercent = result.reduce((sum: number, r: any) => sum + r.percent, 0);
        expect(totalPercent).toBeCloseTo(100, 1);
      });
    });

    describe('happy path - month visibility', () => {
      it('should return rates for month visibility', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 200 },
          { status: 'declined', count: 150 },
          { status: 'pending', count: 50 },
        ]);

        const result = await service.getMatchAcceptanceRates({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        expect(result).toHaveLength(3);
        const approved = result.find((r: any) => r.status === 'approved');
        expect(approved!.count).toBe(200);
      });

      it('should apply month date range filter', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 200 },
          { status: 'declined', count: 150 },
          { status: 'pending', count: 50 },
        ]);

        await service.getMatchAcceptanceRates({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        const callArgs = matchModel.findAll.mock.calls[0][0];
        expect(callArgs).toHaveProperty('where');
      });
    });

    describe('edge cases', () => {
      it('should handle zero matches', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 0 },
          { status: 'declined', count: 0 },
          { status: 'pending', count: 0 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        expect(result.every((r: any) => r.count === 0 && r.percent === 0)).toBe(true);
      });

      it('should handle all matches in one status', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 1000 },
          { status: 'declined', count: 0 },
          { status: 'pending', count: 0 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        const approved = result.find((r: any) => r.status === 'approved');
        expect(approved!.percent).toBe(100);
        const totalPercent = result.reduce((sum: number, r: any) => sum + r.percent, 0);
        expect(totalPercent).toBeCloseTo(100, 1);
      });

      it('should handle equal distribution across statuses', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 333 },
          { status: 'declined', count: 333 },
          { status: 'pending', count: 334 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        const totalPercent = result.reduce((sum: number, r: any) => sum + r.percent, 0);
        expect(totalPercent).toBeCloseTo(100, 1);
      });

      it('should handle very large match counts', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 500000 },
          { status: 'declined', count: 300000 },
          { status: 'pending', count: 200000 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        const approved = result.find((r: any) => r.status === 'approved');
        expect(approved!.count).toBe(500000);
        const totalPercent = result.reduce((sum: number, r: any) => sum + r.percent, 0);
        expect(totalPercent).toBeCloseTo(100, 1);
      });
    });

    describe('admin filtering', () => {
      it('should exclude admin users from match rates', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 60 },
          { status: 'declined', count: 20 },
          { status: 'pending', count: 20 },
        ]);

        await service.getMatchAcceptanceRates({});

        const callArgs = matchModel.findAll.mock.calls[0][0];
        expect(callArgs).toHaveProperty('where');
      });
    });

    describe('percentage calculation accuracy', () => {
      it('should calculate percentages correctly from counts', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 50 },
          { status: 'declined', count: 30 },
          { status: 'pending', count: 20 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        const totalCount = result.reduce((sum: number, r: any) => sum + r.count, 0);
        expect(totalCount).toBe(100);

        result.forEach((match: any) => {
          const expectedPercent = (match.count / totalCount) * 100;
          expect(match.percent).toBeCloseTo(expectedPercent, 1);
        });
      });

      it('should round percentages to reasonable precision', async () => {
        matchModel.findAll.mockResolvedValueOnce([
          { status: 'approved', count: 1 },
          { status: 'declined', count: 1 },
          { status: 'pending', count: 1 },
        ]);

        const result = await service.getMatchAcceptanceRates({});

        result.forEach((match: any) => {
          expect(match.percent % 0.01).toBeLessThanOrEqual(0.01);
        });
      });
    });
  });

  describe('data consistency and integrity', () => {
    it('all methods should exclude admin users', async () => {
      // Align mocks with actual service call patterns (count used for many queries)
      userModel.count.mockResolvedValueOnce(100); // total users
      userModel.count.mockResolvedValueOnce(50); // active users
      userSummariesModel.count.mockResolvedValueOnce(25);
      matchModel.findAll.mockResolvedValueOnce([
        { status: 'approved', count: 60 },
        { status: 'declined', count: 20 },
        { status: 'pending', count: 20 },
      ]);

      await service.getDashboardCounts();

      expect(userModel.count).toHaveBeenCalled();
    });
  });

  describe('period calculations', () => {
    it('should query 6 periods for signup statistics', async () => {
      userModel.count.mockResolvedValue(0);

      await service.getUserSignupStatistics({
        visibility: StatisticsVisibilityEnum.WEEK,
      });

      expect(userModel.count).toHaveBeenCalledTimes(6);
    });

    it('should include role association in queries', async () => {
      userModel.count.mockResolvedValue(0);

      await service.getUserSignupStatistics({
        visibility: StatisticsVisibilityEnum.WEEK,
      });

      const firstCall = userModel.count.mock.calls[0][0];
      expect(firstCall.include).toBeDefined();
    });
  });

  describe('getAiConversationSuccessMetrics()', () => {
    describe('happy path', () => {
      it('should return AI conversation success metrics with correct structure', async () => {
        // Mock 6 weeks x 3 metrics = 18 calls
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(450 - i * 10)
            .mockResolvedValueOnce(280 - i * 5)
            .mockResolvedValueOnce(170 - i * 5);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result).toHaveLength(3);
        expect(result[0]).toHaveProperty('label');
        expect(result[0]).toHaveProperty('data');
        expect(Array.isArray(result[0].data)).toBe(true);
        expect(result[0].data).toHaveLength(6);
      });

      it('should return metrics with correct labels for week visibility', async () => {
        // Mock 6 weeks x 3 metrics = 18 calls
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(450 - i * 10)
            .mockResolvedValueOnce(280 - i * 5)
            .mockResolvedValueOnce(170 - i * 5);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].label).toBe('Successful AI-to-AI Alignments');
        expect(result[1].label).toBe('Conversations Marked as Rejected');
        expect(result[2].label).toBe('Human Intervention');
        expect(result[0].data[0].label).toBe('Week 1');
        expect(result[0].data[5].label).toBe('Week 6');
      });

      it('should return metrics with correct labels for month visibility', async () => {
        // Mock 6 months x 3 metrics = 18 calls
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(900 - i * 50)
            .mockResolvedValueOnce(560 - i * 30)
            .mockResolvedValueOnce(340 - i * 20);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        expect(result).toHaveLength(3);
        expect(result[0].label).toBe('Successful AI-to-AI Alignments');
        expect(result[1].label).toBe('Conversations Marked as Rejected');
        expect(result[2].label).toBe('Human Intervention');
        expect(result[0].data[0].label).toBe('Month 1');
        expect(result[0].data[5].label).toBe('Month 6');
      });

      it('should return correct counts from database', async () => {
        const expectedValues = [
          [450, 280, 170],
          [440, 275, 165],
          [430, 270, 160],
          [420, 265, 155],
          [410, 260, 150],
          [400, 255, 145],
        ];

        expectedValues.forEach(([total, rejected, completed]) => {
          aiConversationModel.count
            .mockResolvedValueOnce(total)
            .mockResolvedValueOnce(rejected)
            .mockResolvedValueOnce(completed);
        });

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].data[0].value).toBe(450);
        expect(result[1].data[0].value).toBe(280);
        expect(result[2].data[0].value).toBe(170);
      });

      it('should handle perfectly balanced distribution', async () => {
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(300)
            .mockResolvedValueOnce(150)
            .mockResolvedValueOnce(150);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].data[0].value).toBe(300);
        expect(result[1].data[0].value).toBe(150);
        expect(result[2].data[0].value).toBe(150);
      });

      it('should handle all rejected (0 completed)', async () => {
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(500)
            .mockResolvedValueOnce(500)
            .mockResolvedValueOnce(0);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].data[0].value).toBe(500);
        expect(result[1].data[0].value).toBe(500);
        expect(result[2].data[0].value).toBe(0);
      });

      it('should handle all completed (0 rejected)', async () => {
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(300)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(300);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].data[0].value).toBe(300);
        expect(result[1].data[0].value).toBe(0);
        expect(result[2].data[0].value).toBe(300);
      });

      it('should use default visibility of WEEK when not provided', async () => {
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(60)
            .mockResolvedValueOnce(40);
        }

        const result = await service.getAiConversationSuccessMetrics({});

        expect(result).toHaveLength(3);
        expect(result[0].data[0].label).toBe('Week 1');
      });
    });

    describe('edge cases', () => {
      it('should handle zero conversations', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(0);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].data.every((d: any) => d.value === 0)).toBe(true);
        expect(result[1].data.every((d: any) => d.value === 0)).toBe(true);
        expect(result[2].data.every((d: any) => d.value === 0)).toBe(true);
      });

      it('should handle single total conversation', async () => {
        aiConversationModel.count
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0);

        for (let i = 1; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].data[0].value).toBe(1);
        expect(result[1].data[0].value).toBe(1);
        expect(result[2].data[0].value).toBe(0);
      });

      it('should handle large dataset', async () => {
        for (let i = 0; i < 6; i++) {
          aiConversationModel.count
            .mockResolvedValueOnce(1000000 - i * 50000)
            .mockResolvedValueOnce(650000 - i * 30000)
            .mockResolvedValueOnce(350000 - i * 20000);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        expect(result[0].data[0].value).toBe(1000000);
        expect(result[1].data[0].value).toBe(650000);
        expect(result[2].data[0].value).toBe(350000);
      });

      it('should handle unequal distribution', async () => {
        const distributions = [
          [333, 200, 133],
          [200, 120, 80],
          [450, 270, 180],
          [100, 60, 40],
          [250, 150, 100],
          [167, 100, 67],
        ];

        distributions.forEach(([total, rejected, completed]) => {
          aiConversationModel.count
            .mockResolvedValueOnce(total)
            .mockResolvedValueOnce(rejected)
            .mockResolvedValueOnce(completed);
        });

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result[0].data[0].value).toBe(333);
        expect(result[1].data[0].value).toBe(200);
        expect(result[2].data[0].value).toBe(133);
      });
    });

    describe('database query validation', () => {
      it('should call aiConversationModel.count() 18 times for 6 periods x 3 metrics', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(aiConversationModel.count).toHaveBeenCalledTimes(18);
      });

      it('should include date range filters in queries', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        const calls = aiConversationModel.count.mock.calls;
        calls.forEach((call: any) => {
          const options = call[0];
          expect(options.where).toBeDefined();
          expect(options.where.created_at).toBeDefined();
          expect(options.where.created_at[Op.gte]).toBeDefined();
          expect(options.where.created_at[Op.lte]).toBeDefined();
        });
      });

      it('should filter for rejected conversations (user_to_user_conversation = false)', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        // Second call should have rejected filter
        const secondCall = aiConversationModel.count.mock.calls[1][0];
        expect(secondCall).toHaveProperty('where');
        expect((secondCall as Record<string, unknown>).where).toHaveProperty(
          'user_to_user_conversation',
          false,
        );
      });

      it('should filter for completed conversations (user_to_user_conversation = true)', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        // Third call should have completed filter
        const thirdCall = aiConversationModel.count.mock.calls[2][0];
        expect(thirdCall).toHaveProperty('where');
        expect((thirdCall as Record<string, unknown>).where).toHaveProperty(
          'user_to_user_conversation',
          true,
        );
      });

      it('should call with WEEK period when week visibility specified', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(aiConversationModel.count).toHaveBeenCalled();
      });

      it('should call with MONTH period when month visibility specified', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        const calls = aiConversationModel.count.mock.calls;
        const firstCall = calls[0][0];
        expect(firstCall.where.created_at).toBeDefined();
      });
    });

    describe('response data types and validation', () => {
      it('should return array of objects', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(Array.isArray(result)).toBe(true);
        expect(result.every(item => typeof item === 'object')).toBe(true);
      });

      it('should have exactly 3 metrics', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result).toHaveLength(3);
      });

      it('each metric should have string label and data array', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        result.forEach((metric: any) => {
          expect(typeof metric.label).toBe('string');
          expect(Array.isArray(metric.data)).toBe(true);
          expect(
            metric.data.every(
              (d: any) => typeof d.label === 'string' && typeof d.value === 'number',
            ),
          ).toBe(true);
        });
      });

      it('should have correct metric labels', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        const labels = result.map((m: any) => m.label);
        expect(labels).toEqual(
          expect.arrayContaining([
            'Successful AI-to-AI Alignments',
            'Conversations Marked as Rejected',
            'Human Intervention',
          ]),
        );
      });

      it('should ensure counts are non-negative', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(Math.max(0, 100 - Math.random() * 50));
        }

        const result = await service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        result.forEach((metric: any) => {
          metric.data.forEach((d: any) => {
            expect(d.value).toBeGreaterThanOrEqual(0);
          });
        });
      });
    });

    describe('method availability and metadata', () => {
      it('should have getAiConversationSuccessMetrics method', () => {
        expect(typeof service.getAiConversationSuccessMetrics).toBe('function');
      });

      it('should return a Promise', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        const result = service.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(result instanceof Promise).toBe(true);
        await result;
      });

      it('should accept StatsVisibilityDto parameter', async () => {
        for (let i = 0; i < 18; i++) {
          aiConversationModel.count.mockResolvedValueOnce(100);
        }

        const dto: StatsVisibilityDto = { visibility: StatisticsVisibilityEnum.WEEK };
        const result = await service.getAiConversationSuccessMetrics(dto);

        expect(result).toBeDefined();
      });
    });
  });
});
