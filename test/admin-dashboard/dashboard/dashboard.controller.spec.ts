import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from '../../../src/modules/super-admin/dashboard/dashboard.controller';
import { DashboardService } from '../../../src/modules/super-admin/dashboard/dashboard.service';
import { StatsVisibilityDto } from '../../../src/modules/super-admin/dashboard/dto/stats-visibility.dto';
import { StatisticsVisibilityEnum } from '../../../src/common/utils/constants/dashboard.constant';

/**
 * DashboardController Unit Tests
 * ============================================================================================
 * Purpose: Test all dashboard controller endpoints at the HTTP/route level
 *
 * Scope:
 * - Route handlers call the correct service methods
 * - Responses match expected shape (labels, values, counts, percentages)
 * - Query parameters are passed correctly to service
 * - Default parameter values are applied
 *
 * Mocking Strategy:
 * - Mock entire DashboardService with jest.fn() for each method
 * - Bypass guards and decorators (mocked at module level)
 *
 * Coverage:
 * 1. getCounts() - dashboard statistics with 3 metrics
 * 2. getUserSignupStatistics() - week/month periods with 6 data points
 * 3. getUserOnboardingStatistics() - grouped by status (3 statuses)
 * 4. getCommonCoreObjectivesStatistics() - objective aggregates
 * 5. getMatchAcceptanceRates() - match status distribution with percentages
 */
describe('DashboardController (Unit Tests)', () => {
  let controller: DashboardController;

  // Mock service with default return values
  const serviceMock: Partial<Record<keyof DashboardService, jest.Mock>> = {
    getDashboardCounts: jest.fn().mockResolvedValue([
      { label: 'Total Users', value: 10 },
      { label: 'Active Users', value: 8 },
      { label: 'AI Generated Summaries', value: 4 },
    ]),
    getUserSignupStatistics: jest.fn().mockResolvedValue([
      { label: 'Week 1', value: 2 },
      { label: 'Week 2', value: 1 },
      { label: 'Week 3', value: 3 },
      { label: 'Week 4', value: 4 },
      { label: 'Week 5', value: 5 },
      { label: 'Week 6', value: 6 },
    ]),
    getUserOnboardingStatistics: jest.fn().mockResolvedValue([
      { status: 'not_started', label: 'Not Started', count: 3 },
      { status: 'in_progress', label: 'In Progress', count: 2 },
      { status: 'completed', label: 'Completed', count: 5 },
    ]),
    getCommonCoreObjectivesStats: jest.fn().mockResolvedValue([
      { label: 'Raising Capital', count: 3 },
      { label: 'Networking', count: 2 },
    ]),
    getMatchAcceptanceRates: jest.fn().mockResolvedValue([
      { status: 'approved', label: 'Approved', count: 6, percent: 60 },
      { status: 'declined', label: 'Declined', count: 2, percent: 20 },
      { status: 'pending', label: 'Pending', count: 2, percent: 20 },
    ]),
    getAiConversationSuccessMetrics: jest.fn().mockResolvedValue([
      { label: 'Successful AI-to-AI Alignments', count: 450, status: 'total' },
      { label: 'Conversations Marked as Rejected', count: 280, status: 'rejected' },
      { label: 'Human Intervention', count: 170, status: 'completed' },
    ]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller.getCounts).toBeDefined();
    expect(controller.getUserSignupStatistics).toBeDefined();
    expect(controller.getUserOnboardingStatistics).toBeDefined();
    expect(controller.getCommonCoreObjectivesStatistics).toBeDefined();
    expect(controller.getMatchAcceptanceRates).toBeDefined();
    expect(controller.getAiConversationSuccessMetrics).toBeDefined();
  });

  describe('getCounts()', () => {
    describe('happy path', () => {
      it('should return dashboard counts with exactly 3 metrics', async () => {
        const result = await controller.getCounts();

        expect(result).toHaveLength(3);
        expect(serviceMock.getDashboardCounts).toHaveBeenCalledTimes(1);
      });

      it('should return metrics in correct order: Total Users, Active Users, AI Summaries', async () => {
        const result = await controller.getCounts();

        expect(result[0].label).toBe('Total Users');
        expect(result[1].label).toBe('Active Users');
        expect(result[2].label).toBe('AI Generated Summaries');
      });

      it('should have numeric values for all metrics', async () => {
        const result = await controller.getCounts();

        result.forEach(metric => {
          expect(typeof metric.value).toBe('number');
          expect(metric.value).toBeGreaterThanOrEqual(0);
        });
      });

      it('should return correct values from service', async () => {
        const result = await controller.getCounts();

        expect(result[0].value).toBe(10);
        expect(result[1].value).toBe(8);
        expect(result[2].value).toBe(4);
      });
    });

    describe('edge cases', () => {
      it('should handle zero counts', async () => {
        serviceMock.getDashboardCounts.mockResolvedValueOnce([
          { label: 'Total Users', value: 0 },
          { label: 'Active Users', value: 0 },
          { label: 'AI Generated Summaries', value: 0 },
        ]);

        const result = await controller.getCounts();

        expect(result.every(m => m.value === 0)).toBe(true);
      });

      it('should handle large numbers', async () => {
        const largeValue = 999999999;
        serviceMock.getDashboardCounts.mockResolvedValueOnce([
          { label: 'Total Users', value: largeValue },
          { label: 'Active Users', value: largeValue },
          { label: 'AI Generated Summaries', value: largeValue },
        ]);

        const result = await controller.getCounts();

        expect(result[0].value).toBe(largeValue);
      });

      it('should have valid label strings for all metrics', async () => {
        const result = await controller.getCounts();

        result.forEach(metric => {
          expect(metric.label).toBeTruthy();
          expect(typeof metric.label).toBe('string');
          expect(metric.label.length).toBeGreaterThan(0);
        });
      });
    });

    describe('response shape validation', () => {
      it('should have label and value properties on each metric', async () => {
        const result = await controller.getCounts();

        result.forEach(metric => {
          expect(metric).toHaveProperty('label');
          expect(metric).toHaveProperty('value');
          expect(Object.keys(metric)).toEqual(['label', 'value']);
        });
      });
    });
  });

  describe('getUserSignupStatistics()', () => {
    describe('happy path - week visibility', () => {
      it('should call service with default week visibility when no dto provided', async () => {
        const dto: StatsVisibilityDto = {};
        await controller.getUserSignupStatistics(dto);

        expect(serviceMock.getUserSignupStatistics).toHaveBeenCalledWith(dto);
        expect(serviceMock.getUserSignupStatistics).toHaveBeenCalledTimes(1);
      });

      it('should return data for 6 weeks', async () => {
        const sixWeeks = Array.from({ length: 6 }, (_, i) => ({
          label: `Week ${i + 1}`,
          value: Math.floor(Math.random() * 100),
        }));
        serviceMock.getUserSignupStatistics.mockResolvedValueOnce(sixWeeks);

        const result = await controller.getUserSignupStatistics({});

        expect(result).toHaveLength(6);
        expect(result.every(r => r.label.startsWith('Week'))).toBe(true);
      });

      it('should have week 1 as most recent period', async () => {
        const result = await controller.getUserSignupStatistics({});

        expect(result[0].label).toBe('Week 1');
      });

      it('should have week 6 as oldest period', async () => {
        const result = await controller.getUserSignupStatistics({});

        expect(result[5].label).toBe('Week 6');
      });

      it('should have numeric values for all weeks', async () => {
        const result = await controller.getUserSignupStatistics({});

        result.forEach(week => {
          expect(typeof week.value).toBe('number');
          expect(week.value).toBeGreaterThanOrEqual(0);
        });
      });
    });

    describe('happy path - month visibility', () => {
      it('should call service with month visibility when specified', async () => {
        const dto: StatsVisibilityDto = { visibility: StatisticsVisibilityEnum.MONTH };
        await controller.getUserSignupStatistics(dto);

        expect(serviceMock.getUserSignupStatistics).toHaveBeenCalledWith(dto);
      });

      it('should return data for 6 months', async () => {
        const sixMonths = Array.from({ length: 6 }, (_, i) => ({
          label: `Month ${i + 1}`,
          value: Math.floor(Math.random() * 200),
        }));
        serviceMock.getUserSignupStatistics.mockResolvedValueOnce(sixMonths);

        const result = await controller.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        expect(result).toHaveLength(6);
        expect(result.every(r => r.label.startsWith('Month'))).toBe(true);
      });

      it('should have month 1 as most recent period', async () => {
        const sixMonths = Array.from({ length: 6 }, (_, i) => ({
          label: `Month ${i + 1}`,
          value: i * 10,
        }));
        serviceMock.getUserSignupStatistics.mockResolvedValueOnce(sixMonths);

        const result = await controller.getUserSignupStatistics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        expect(result[0].label).toBe('Month 1');
      });
    });

    describe('edge cases', () => {
      it('should handle zero signups in all periods', async () => {
        serviceMock.getUserSignupStatistics.mockResolvedValueOnce(
          Array.from({ length: 6 }, (_, i) => ({
            label: `Week ${i + 1}`,
            value: 0,
          })),
        );

        const result = await controller.getUserSignupStatistics({});

        expect(result.every(w => w.value === 0)).toBe(true);
      });

      it('should handle high signup volumes', async () => {
        serviceMock.getUserSignupStatistics.mockResolvedValueOnce(
          Array.from({ length: 6 }, (_, i) => ({
            label: `Week ${i + 1}`,
            value: 10000 * (i + 1),
          })),
        );

        const result = await controller.getUserSignupStatistics({});

        expect(result[5].value).toBe(60000);
      });
    });

    describe('response shape validation', () => {
      it('should have label and value on each period', async () => {
        const result = await controller.getUserSignupStatistics({});

        result.forEach(item => {
          expect(item).toHaveProperty('label');
          expect(item).toHaveProperty('value');
        });
      });

      it('should return arrays with exactly 6 items', async () => {
        const result = await controller.getUserSignupStatistics({});
        expect(result.length).toBe(6);
      });
    });
  });

  describe('getUserOnboardingStatistics()', () => {
    describe('happy path', () => {
      it('should return onboarding statistics', async () => {
        const result = await controller.getUserOnboardingStatistics();

        expect(serviceMock.getUserOnboardingStatistics).toHaveBeenCalledTimes(1);
        expect(result).toBeDefined();
      });

      it('should return all 3 onboarding statuses', async () => {
        const result = await controller.getUserOnboardingStatistics();

        expect(result).toHaveLength(3);
        expect(result.map(r => r.status)).toEqual(['not_started', 'in_progress', 'completed']);
      });

      it('should have correct labels for each status', async () => {
        const result = await controller.getUserOnboardingStatistics();

        expect(result[0].label).toBe('Not Started');
        expect(result[1].label).toBe('In Progress');
        expect(result[2].label).toBe('Completed');
      });

      it('should have correct counts', async () => {
        const result = await controller.getUserOnboardingStatistics();

        expect(result[0].count).toBe(3);
        expect(result[1].count).toBe(2);
        expect(result[2].count).toBe(5);
      });

      it('should have numeric counts for all statuses', async () => {
        const result = await controller.getUserOnboardingStatistics();

        result.forEach(status => {
          expect(typeof status.count).toBe('number');
          expect(status.count).toBeGreaterThanOrEqual(0);
        });
      });
    });

    describe('edge cases', () => {
      it('should handle zero users in all statuses', async () => {
        serviceMock.getUserOnboardingStatistics.mockResolvedValueOnce([
          { status: 'not_started', label: 'Not Started', count: 0 },
          { status: 'in_progress', label: 'In Progress', count: 0 },
          { status: 'completed', label: 'Completed', count: 0 },
        ]);

        const result = await controller.getUserOnboardingStatistics();

        expect(result.every(s => s.count === 0)).toBe(true);
      });

      it('should handle all users in one status', async () => {
        serviceMock.getUserOnboardingStatistics.mockResolvedValueOnce([
          { status: 'not_started', label: 'Not Started', count: 0 },
          { status: 'in_progress', label: 'In Progress', count: 0 },
          { status: 'completed', label: 'Completed', count: 1000 },
        ]);

        const result = await controller.getUserOnboardingStatistics();

        expect(result[2].count).toBe(1000);
        expect(result.reduce((sum, s) => sum + s.count, 0)).toBe(1000);
      });
    });

    describe('response shape validation', () => {
      it('should have status, label, and count properties', async () => {
        const result = await controller.getUserOnboardingStatistics();

        result.forEach(item => {
          expect(item).toHaveProperty('status');
          expect(item).toHaveProperty('label');
          expect(item).toHaveProperty('count');
        });
      });
    });
  });

  describe('getCommonCoreObjectivesStatistics()', () => {
    describe('happy path', () => {
      it('should return objectives statistics', async () => {
        const result = await controller.getCommonCoreObjectivesStatistics();

        expect(serviceMock.getCommonCoreObjectivesStats).toHaveBeenCalledTimes(1);
        expect(result).toBeDefined();
      });

      it('should return objectives sorted by count descending', async () => {
        const result = await controller.getCommonCoreObjectivesStatistics();

        for (let i = 0; i < result.length - 1; i++) {
          expect(result[i].count).toBeGreaterThanOrEqual(result[i + 1].count);
        }
      });

      it('should have label and count for each objective', async () => {
        const result = await controller.getCommonCoreObjectivesStatistics();

        result.forEach(obj => {
          expect(obj).toHaveProperty('label');
          expect(obj).toHaveProperty('count');
          expect(typeof obj.label).toBe('string');
          expect(typeof obj.count).toBe('number');
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty objectives list', async () => {
        serviceMock.getCommonCoreObjectivesStats.mockResolvedValueOnce([]);

        const result = await controller.getCommonCoreObjectivesStatistics();

        expect(result).toEqual([]);
      });

      it('should handle single objective', async () => {
        serviceMock.getCommonCoreObjectivesStats.mockResolvedValueOnce([
          { label: 'Only Objective', count: 50 },
        ]);

        const result = await controller.getCommonCoreObjectivesStatistics();

        expect(result).toHaveLength(1);
      });

      it('should handle many objectives', async () => {
        const manyObjectives = Array.from({ length: 10 }, (_, i) => ({
          label: `Objective ${i + 1}`,
          count: 100 - i * 10,
        }));
        serviceMock.getCommonCoreObjectivesStats.mockResolvedValueOnce(manyObjectives);

        const result = await controller.getCommonCoreObjectivesStatistics();

        expect(result).toHaveLength(10);
      });
    });

    describe('response shape validation', () => {
      it('should have label and count on each objective', async () => {
        const result = await controller.getCommonCoreObjectivesStatistics();

        result.forEach(obj => {
          expect(Object.keys(obj)).toEqual(expect.arrayContaining(['label', 'count']));
        });
      });
    });
  });

  describe('getMatchAcceptanceRates()', () => {
    describe('happy path - week visibility', () => {
      it('should return match rates with default week visibility', async () => {
        const dto: StatsVisibilityDto = {};
        const result = await controller.getMatchAcceptanceRates(dto);

        expect(serviceMock.getMatchAcceptanceRates).toHaveBeenCalledWith(dto);
        expect(result).toBeDefined();
      });

      it('should return all 3 match statuses', async () => {
        const result = await controller.getMatchAcceptanceRates({});

        expect(result).toHaveLength(3);
        expect(result.map(r => r.status)).toEqual(
          expect.arrayContaining(['approved', 'declined', 'pending']),
        );
      });

      it('should have correct labels for match statuses', async () => {
        const result = await controller.getMatchAcceptanceRates({});

        result.forEach(match => {
          expect(match.label).toBeTruthy();
          expect(typeof match.label).toBe('string');
        });
      });

      it('should have count and percent for each status', async () => {
        const result = await controller.getMatchAcceptanceRates({});

        result.forEach(match => {
          expect(typeof match.count).toBe('number');
          expect(typeof match.percent).toBe('number');
          expect(match.count).toBeGreaterThanOrEqual(0);
          expect(match.percent).toBeGreaterThanOrEqual(0);
          expect(match.percent).toBeLessThanOrEqual(100);
        });
      });

      it('should have percentages that sum to approximately 100%', async () => {
        const result = await controller.getMatchAcceptanceRates({});

        const totalPercent = result.reduce((sum, r) => sum + r.percent, 0);
        expect(totalPercent).toBeCloseTo(100, 1);
      });
    });

    describe('happy path - month visibility', () => {
      it('should call service with month visibility when specified', async () => {
        const dto: StatsVisibilityDto = { visibility: StatisticsVisibilityEnum.MONTH };
        await controller.getMatchAcceptanceRates(dto);

        expect(serviceMock.getMatchAcceptanceRates).toHaveBeenCalledWith(dto);
      });

      it('should return rates for month visibility', async () => {
        const dto: StatsVisibilityDto = { visibility: StatisticsVisibilityEnum.MONTH };
        serviceMock.getMatchAcceptanceRates.mockResolvedValueOnce([
          { status: 'approved', label: 'Approved', count: 200, percent: 50 },
          { status: 'declined', label: 'Declined', count: 150, percent: 37.5 },
          { status: 'pending', label: 'Pending', count: 50, percent: 12.5 },
        ]);

        const result = await controller.getMatchAcceptanceRates(dto);

        expect(result).toHaveLength(3);
        expect(result[0].count).toBe(200);
      });
    });

    describe('edge cases', () => {
      it('should handle zero matches', async () => {
        serviceMock.getMatchAcceptanceRates.mockResolvedValueOnce([
          { status: 'approved', label: 'Approved', count: 0, percent: 0 },
          { status: 'declined', label: 'Declined', count: 0, percent: 0 },
          { status: 'pending', label: 'Pending', count: 0, percent: 0 },
        ]);

        const result = await controller.getMatchAcceptanceRates({});

        expect(result.every(r => r.count === 0 && r.percent === 0)).toBe(true);
      });

      it('should handle all matches in one status', async () => {
        serviceMock.getMatchAcceptanceRates.mockResolvedValueOnce([
          { status: 'approved', label: 'Approved', count: 1000, percent: 100 },
          { status: 'declined', label: 'Declined', count: 0, percent: 0 },
          { status: 'pending', label: 'Pending', count: 0, percent: 0 },
        ]);

        const result = await controller.getMatchAcceptanceRates({});

        expect(result[0].percent).toBe(100);
      });

      it('should handle equal distribution across statuses', async () => {
        serviceMock.getMatchAcceptanceRates.mockResolvedValueOnce([
          { status: 'approved', label: 'Approved', count: 100, percent: 33.33 },
          { status: 'declined', label: 'Declined', count: 100, percent: 33.33 },
          { status: 'pending', label: 'Pending', count: 100, percent: 33.34 },
        ]);

        const result = await controller.getMatchAcceptanceRates({});

        const totalPercent = result.reduce((sum, r) => sum + r.percent, 0);
        expect(totalPercent).toBeCloseTo(100, 0);
      });
    });

    describe('response shape validation', () => {
      it('should have status, label, count, and percent properties', async () => {
        const result = await controller.getMatchAcceptanceRates({});

        result.forEach(match => {
          expect(match).toHaveProperty('status');
          expect(match).toHaveProperty('label');
          expect(match).toHaveProperty('count');
          expect(match).toHaveProperty('percent');
        });
      });

      it('should return exactly 3 match statuses', async () => {
        const result = await controller.getMatchAcceptanceRates({});
        expect(result.length).toBe(3);
      });
    });
  });

  describe('getAiConversationSuccessMetrics()', () => {
    describe('happy path', () => {
      it('should return AI conversation success metrics', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        expect(result).toBeDefined();
        expect(serviceMock.getAiConversationSuccessMetrics).toHaveBeenCalledTimes(1);
      });

      it('should return array with required properties', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(3);
        result.forEach(metric => {
          expect(metric).toHaveProperty('label');
          expect(metric).toHaveProperty('count');
          expect(metric).toHaveProperty('status');
        });
      });

      it('should return correct values from service', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        expect(result[0].count).toBe(450);
        expect(result[1].count).toBe(280);
        expect(result[2].count).toBe(170);
      });

      it('should return correct labels', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        expect(result[0].label).toBe('Successful AI-to-AI Alignments');
        expect(result[1].label).toBe('Conversations Marked as Rejected');
        expect(result[2].label).toBe('Human Intervention');
      });

      it('should return correct status values', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        expect(result[0].status).toBe('total');
        expect(result[1].status).toBe('rejected');
        expect(result[2].status).toBe('completed');
      });

      it('should pass query parameter to service', async () => {
        const query = { visibility: StatisticsVisibilityEnum.WEEK };
        await controller.getAiConversationSuccessMetrics(query);

        expect(serviceMock.getAiConversationSuccessMetrics).toHaveBeenCalledWith(query);
      });
    });

    describe('response shape validation', () => {
      it('should have numeric count values', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        result.forEach(metric => {
          expect(typeof metric.count).toBe('number');
        });
      });

      it('should have string label values', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        result.forEach(metric => {
          expect(typeof metric.label).toBe('string');
        });
      });

      it('should have string status values', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        result.forEach(metric => {
          expect(typeof metric.status).toBe('string');
        });
      });

      it('should have exactly 3 metrics', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        expect(result).toHaveLength(3);
      });

      it('should have valid status values', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        const statuses = result.map(m => m.status);
        expect(statuses).toEqual(expect.arrayContaining(['total', 'rejected', 'completed']));
      });

      it('all counts should be non-negative', async () => {
        const result = await controller.getAiConversationSuccessMetrics({});

        result.forEach(metric => {
          expect(metric.count).toBeGreaterThanOrEqual(0);
        });
      });
    });

    describe('service integration', () => {
      it('should call service method with default query', async () => {
        await controller.getAiConversationSuccessMetrics({});

        expect(serviceMock.getAiConversationSuccessMetrics).toHaveBeenCalled();
      });

      it('should call service method with week visibility', async () => {
        await controller.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.WEEK,
        });

        expect(serviceMock.getAiConversationSuccessMetrics).toHaveBeenCalledWith({
          visibility: StatisticsVisibilityEnum.WEEK,
        });
      });

      it('should call service method with month visibility', async () => {
        await controller.getAiConversationSuccessMetrics({
          visibility: StatisticsVisibilityEnum.MONTH,
        });

        expect(serviceMock.getAiConversationSuccessMetrics).toHaveBeenCalledWith({
          visibility: StatisticsVisibilityEnum.MONTH,
        });
      });

      it('should return service result directly', async () => {
        const mockResult = [
          { label: 'Test Total', count: 100, status: 'total' },
          { label: 'Test Rejected', count: 60, status: 'rejected' },
          { label: 'Test Completed', count: 40, status: 'completed' },
        ];
        serviceMock.getAiConversationSuccessMetrics?.mockResolvedValueOnce(mockResult);

        const result = await controller.getAiConversationSuccessMetrics({});

        expect(result).toEqual(mockResult);
      });

      it('should propagate service errors', async () => {
        const error = new Error('Database error');
        serviceMock.getAiConversationSuccessMetrics?.mockRejectedValueOnce(error);

        await expect(controller.getAiConversationSuccessMetrics({})).rejects.toThrow(
          'Database error',
        );
      });
    });
  });

  describe('integration patterns', () => {
    it('all endpoints should be callable without errors', async () => {
      await expect(controller.getCounts()).resolves.not.toThrow();
      await expect(controller.getUserSignupStatistics({})).resolves.not.toThrow();
      await expect(controller.getUserOnboardingStatistics()).resolves.not.toThrow();
      await expect(controller.getCommonCoreObjectivesStatistics()).resolves.not.toThrow();
      await expect(controller.getMatchAcceptanceRates({})).resolves.not.toThrow();
      await expect(controller.getAiConversationSuccessMetrics({})).resolves.not.toThrow();
    });

    it('service methods should be called correct number of times', async () => {
      await controller.getCounts();
      await controller.getUserSignupStatistics({});
      await controller.getUserOnboardingStatistics();
      await controller.getCommonCoreObjectivesStatistics();
      await controller.getMatchAcceptanceRates({});
      await controller.getAiConversationSuccessMetrics({});

      expect(serviceMock.getDashboardCounts).toHaveBeenCalledTimes(1);
      expect(serviceMock.getUserSignupStatistics).toHaveBeenCalledTimes(1);
      expect(serviceMock.getUserOnboardingStatistics).toHaveBeenCalledTimes(1);
      expect(serviceMock.getCommonCoreObjectivesStats).toHaveBeenCalledTimes(1);
      expect(serviceMock.getMatchAcceptanceRates).toHaveBeenCalledTimes(1);
      expect(serviceMock.getAiConversationSuccessMetrics).toHaveBeenCalledTimes(1);
    });
  });
});
