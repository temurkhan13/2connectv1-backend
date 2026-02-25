import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Sequelize } from 'sequelize-typescript';
import { Match } from 'src/common/entities/match.entity';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { User } from 'src/common/entities/user.entity';
import { StatusEnum, SubStatusEnum } from 'src/common/utils/constants/list-matches.constant';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';
import { MailService } from 'src/modules/mail/mail.service';

/**
 * DashboardService Unit Tests
 * ============================================================================================
 * Purpose: Comprehensive testing of user dashboard business logic
 *
 * Scope:
 * - listMatches(): Paginated match listings with filtering (status, sub_status, dates)
 * - getOnboardingMatches(): Initial onboarding matches
 * - decideMatch(): User decision on matches (approve/decline)
 * - quickStats(): User dashboard statistics
 * - aiMatchAnalytics(): AI-driven match insights
 * - submitMatchFeedback(): Submit feedback for matches
 * - recentAgentActivity(): Recent activity logs
 * - countMatchesByStatus(): Match counts by status buckets
 *
 * Key Features Tested:
 * 1. status_label computation (Approved, Awaiting Other, Pending With Me, Passed By Me, Passed By Other, Passed)
 * 2. feedback message logic (3 conditions: Passed by both, Feedback collected, No feedback)
 * 3. Pagination and filtering
 * 4. Complex query logic for A-side and B-side branches
 * 5. Transaction handling for decisions
 * 6. Error handling (BadRequest, NotFound, Forbidden)
 */
describe('DashboardService (User Dashboard)', () => {
  let service: DashboardService;
  let matchModel: any;
  let userModel: any;
  let userActivityLogModel: any;
  let mailService: any;
  let dailyAnalyticsService: any;
  let sequelize: any;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockOtherUserId = '22222222-2222-2222-2222-222222222222';
  const mockMatchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(async () => {
    // Mock Sequelize instance
    sequelize = {
      escape: jest.fn(val => `'${val}'`),
      literal: jest.fn(sql => ({ val: sql })),
      fn: jest.fn(),
      col: jest.fn(),
      transaction: jest.fn(),
    };

    // Mock Match model
    matchModel = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    };

    // Mock User model
    userModel = {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      update: jest.fn(),
    };

    // Mock UserActivityLog model
    userActivityLogModel = {
      findAndCountAll: jest.fn(),
    };

    // Mock MailService
    mailService = {
      sendAwaitingResponseEmail: jest.fn().mockResolvedValue({ success: true }),
    };

    // Mock DailyAnalyticsService
    dailyAnalyticsService = {
      bumpToday: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getModelToken(Match),
          useValue: matchModel,
        },
        {
          provide: getModelToken(User),
          useValue: userModel,
        },
        {
          provide: getModelToken(UserActivityLog),
          useValue: userActivityLogModel,
        },
        {
          provide: MailService,
          useValue: mailService,
        },
        {
          provide: DailyAnalyticsService,
          useValue: dailyAnalyticsService,
        },
        {
          provide: Sequelize,
          useValue: sequelize,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have all required methods', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.listMatches).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.getOnboardingMatches).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.decideMatch).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.quickStats).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.aiMatchAnalytics).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.submitMatchFeedback).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.recentAgentActivity).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.countMatchesByStatus).toBeDefined();
    });
  });

  describe('listMatches()', () => {
    describe('Status Label Computation', () => {
      it('should return "Approved" for approved matches', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].status_label).toBe('Approved');
      });

      it('should return "Awaiting Other" when user approved but other pending', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'pending',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'pending',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
        });

        expect(result.items[0].status_label).toBe('Awaiting Other');
      });

      it('should return "Pending With Me" when user has not decided', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'pending',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'pending',
          user_b_decision: 'pending',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
        });

        expect(result.items[0].status_label).toBe('Pending With Me');
      });

      it('should return "Passed By Me" when user declined', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'declined',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'declined',
          user_b_decision: 'pending',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
        });

        expect(result.items[0].status_label).toBe('Passed By Me');
      });

      it('should return "Passed By Other" when other user declined', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'declined',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'pending',
          user_b_decision: 'declined',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
        });

        expect(result.items[0].status_label).toBe('Passed By Other');
      });

      it('should return "Passed" when both users declined', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'declined',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'declined',
          user_b_decision: 'declined',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
        });

        expect(result.items[0].status_label).toBe('Passed');
      });
    });

    describe('Feedback Message Logic', () => {
      it('should return "The match has been Passed by both parties" when both declined', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'declined',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'declined',
          user_b_decision: 'declined',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
        });

        expect(result.items[0].feedback).toBe('The match has been Passed by both parties');
      });

      it('should return "Feedback has been collected" when user A has feedback', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: 'Great match!',
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].feedback).toBe('Feedback has been collected');
      });

      it('should return "Feedback has been collected" when user B has feedback', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: null,
          user_b_feedback: 'Good experience',
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].feedback).toBe('Feedback has been collected');
      });

      it('should return "Feedback has been collected" when both have feedback', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: 'Great match!',
          user_b_feedback: 'Good experience',
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].feedback).toBe('Feedback has been collected');
      });

      it('should return "No Feedback was given" when no feedback exists', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].feedback).toBe('No Feedback was given');
      });

      it('should ignore empty/whitespace feedback', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: '   ',
          user_b_feedback: '',
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].feedback).toBe('No Feedback was given');
      });

      it('should prioritize "Passed" message over feedback presence', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'declined',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'declined',
          user_b_decision: 'declined',
          user_a_feedback: 'Some feedback',
          user_b_feedback: 'Other feedback',
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
        });

        expect(result.items[0].feedback).toBe('The match has been Passed by both parties');
      });
    });

    describe('Pagination', () => {
      it('should return correct pagination meta', async () => {
        const mockMatches = Array.from({ length: 5 }, (_, i) => ({
          id: `match-${i}`,
          match_date: new Date('2025-01-05'),
          status: 'pending',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'pending',
          user_b_decision: 'pending',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: `User ${i}`,
          other_user_designation: 'Member',
          other_user_objective: 'Objective',
        }));

        matchModel.findAndCountAll.mockResolvedValue({
          rows: mockMatches,
          count: 25,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
          page: 2,
          limit: 5,
        });

        expect(result.meta).toEqual({
          page: 2,
          limit: 5,
          total: 25,
          pages: 5,
        });
      });

      it('should handle default pagination values', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
        });

        expect(result.meta.page).toBe(1);
        expect(result.meta.limit).toBe(20);
      });

      it('should enforce maximum limit of 100', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
          limit: 200,
        });

        expect(result.meta.limit).toBe(100);
      });

      it('should enforce minimum page of 1', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
          page: 0,
        });

        expect(result.meta.page).toBe(1);
      });
    });

    describe('Status Filtering', () => {
      it('should filter by pending status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
        const callArgs = matchModel.findAndCountAll.mock.calls[0][0];
        expect(callArgs.where).toBeDefined();
      });

      it('should filter by approved status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should filter by declined status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });
    });

    describe('Sub-Status Filtering', () => {
      it('should filter approved by "approved" sub-status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
          sub_status: SubStatusEnum.APPROVED,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should filter approved by "awaiting_other" sub-status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
          sub_status: SubStatusEnum.AWAITING_OTHER,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should filter declined by "passed_by_me" sub-status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
          sub_status: SubStatusEnum.PASSED_BY_ME,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should filter declined by "passed_by_other" sub-status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
          sub_status: SubStatusEnum.PASSED_BY_OTHER,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should filter declined by "passed" sub-status', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.DECLINED,
          sub_status: SubStatusEnum.PASSED,
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should reject sub_status for pending status', async () => {
        await expect(
          service.listMatches(mockUserId, {
            status: StatusEnum.PENDING,
            sub_status: SubStatusEnum.APPROVED,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject invalid sub_status for approved', async () => {
        await expect(
          service.listMatches(mockUserId, {
            status: StatusEnum.APPROVED,
            sub_status: SubStatusEnum.PASSED_BY_ME,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject invalid sub_status for declined', async () => {
        await expect(
          service.listMatches(mockUserId, {
            status: StatusEnum.DECLINED,
            sub_status: SubStatusEnum.AWAITING_OTHER,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('Date Filtering', () => {
      it('should filter by start_date', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
          start_date: new Date('2025-01-01'),
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should filter by end_date', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
          end_date: new Date('2025-12-31'),
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });

      it('should filter by date range', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
          start_date: new Date('2025-01-01'),
          end_date: new Date('2025-12-31'),
        });

        expect(matchModel.findAndCountAll).toHaveBeenCalled();
      });
    });

    describe('Response Structure', () => {
      it('should return items and meta', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
        });

        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('meta');
        expect(Array.isArray(result.items)).toBe(true);
      });

      it('should include all required fields in items', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0]).toHaveProperty('id');
        expect(result.items[0]).toHaveProperty('match_date');
        expect(result.items[0]).toHaveProperty('status');
        expect(result.items[0]).toHaveProperty('status_label');
        expect(result.items[0]).toHaveProperty('feedback');
        expect(result.items[0]).toHaveProperty('other_user');
      });

      it('should include other_user object with correct fields', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].other_user).toHaveProperty('id');
        expect(result.items[0].other_user).toHaveProperty('name');
        expect(result.items[0].other_user).toHaveProperty('designation');
        expect(result.items[0].other_user).toHaveProperty('objective');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty results', async () => {
        matchModel.findAndCountAll.mockResolvedValue({
          rows: [],
          count: 0,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
        });

        expect(result.items).toEqual([]);
        expect(result.meta.total).toBe(0);
      });

      it('should handle user as userB', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'approved',
          user_a_id: mockOtherUserId,
          user_b_id: mockUserId,
          user_a_decision: 'approved',
          user_b_decision: 'approved',
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.APPROVED,
        });

        expect(result.items[0].status_label).toBe('Approved');
      });

      it('should handle null decisions', async () => {
        const mockMatch = {
          id: mockMatchId,
          match_date: new Date('2025-01-05'),
          status: 'pending',
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_decision: null,
          user_b_decision: null,
          user_a_feedback: null,
          user_b_feedback: null,
          other_user_id: mockOtherUserId,
          other_user_name: 'Jane Doe',
          other_user_designation: 'Senior PM',
          other_user_objective: 'Find mentors',
        };

        matchModel.findAndCountAll.mockResolvedValue({
          rows: [mockMatch],
          count: 1,
        });

        const result = await service.listMatches(mockUserId, {
          status: StatusEnum.PENDING,
        });

        expect(result.items[0].status_label).toBe('Pending With Me');
      });
    });
  });

  describe('getOnboardingMatches()', () => {
    it('should mark onboarding_matches as true', async () => {
      userModel.update.mockResolvedValue([1]);
      matchModel.findAll.mockResolvedValue([]);

      await service.getOnboardingMatches(mockUserId);

      expect(userModel.update).toHaveBeenCalledWith(
        { onboarding_matches: true },
        { where: { id: mockUserId } },
      );
    });

    it('should return matches with status_label and feedback', async () => {
      userModel.update.mockResolvedValue([1]);
      const mockMatch = {
        id: mockMatchId,
        match_date: new Date('2025-01-05'),
        status: 'pending',
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_decision: 'pending',
        user_b_decision: 'pending',
        user_a_feedback: null,
        user_b_feedback: null,
        other_user_id: mockOtherUserId,
        other_user_name: 'Jane Doe',
        other_user_designation: 'Senior PM',
        other_user_objective: 'Find mentors',
      };

      matchModel.findAll.mockResolvedValue([mockMatch]);

      const result = await service.getOnboardingMatches(mockUserId);

      expect(result[0]).toHaveProperty('status_label');
      expect(result[0]).toHaveProperty('feedback');
    });
  });

  describe('decideMatch()', () => {
    const mockTransaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn(),
      rollback: jest.fn(),
    };

    beforeEach(() => {
      sequelize.transaction.mockImplementation(async callback => {
        return callback(mockTransaction);
      });
    });

    it('should reject invalid decision', async () => {
      await expect(service.decideMatch(mockMatchId, mockUserId, 'invalid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should approve match successfully', async () => {
      const mockMatch = {
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_decision: 'pending',
        user_b_decision: 'pending',
        status: 'pending',
      };

      matchModel.findOne.mockResolvedValue(mockMatch);
      matchModel.update.mockResolvedValue([1]);
      matchModel.findByPk.mockResolvedValue({
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_decision: 'approved',
        user_b_decision: 'pending',
        status: 'pending',
      });
      userModel.findOne.mockResolvedValue({ email: 'other@test.com' });
      userModel.findOne.mockResolvedValue({ first_name: 'John' });

      const result = await service.decideMatch(mockMatchId, mockUserId, 'approved');

      expect(result.user_a_decision).toBe('approved');
      expect(dailyAnalyticsService.bumpToday).toHaveBeenCalledWith('matches_approved', {
        by: 1,
        transaction: mockTransaction,
      });
    });

    it('should decline match successfully', async () => {
      const mockMatch = {
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_decision: 'pending',
        user_b_decision: 'pending',
        status: 'pending',
      };

      matchModel.findOne.mockResolvedValue(mockMatch);
      matchModel.update.mockResolvedValue([1]);
      matchModel.findByPk.mockResolvedValue({
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_decision: 'declined',
        user_b_decision: 'pending',
        status: 'declined',
      });

      const result = await service.decideMatch(mockMatchId, mockUserId, 'declined');

      expect(result.status).toBe('declined');
      expect(dailyAnalyticsService.bumpToday).toHaveBeenCalledWith('matches_declined', {
        by: 1,
        transaction: mockTransaction,
      });
    });

    it('should throw error if match not found', async () => {
      matchModel.findOne.mockResolvedValue(null);

      await expect(service.decideMatch(mockMatchId, mockUserId, 'approved')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if already decided', async () => {
      const mockMatch = {
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_decision: 'approved',
        user_b_decision: 'pending',
        status: 'pending',
      };

      matchModel.findOne.mockResolvedValue(mockMatch);

      await expect(service.decideMatch(mockMatchId, mockUserId, 'approved')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submitMatchFeedback()', () => {
    const mockTransaction = {
      commit: jest.fn(),
      rollback: jest.fn(),
    };

    beforeEach(() => {
      sequelize.transaction.mockImplementation(async callback => {
        return callback(mockTransaction);
      });
    });

    it('should submit feedback as user A', async () => {
      const mockMatch = {
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_feedback: null,
        user_b_feedback: null,
        get: jest.fn().mockReturnThis(),
      };

      matchModel.findOne.mockResolvedValue(mockMatch);
      matchModel.update.mockResolvedValue([1]);
      matchModel.findOne.mockResolvedValueOnce(mockMatch).mockResolvedValueOnce({
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_feedback: 'Great match!',
        user_b_feedback: null,
        get: jest.fn(() => ({
          id: mockMatchId,
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_feedback: 'Great match!',
          user_b_feedback: null,
        })),
      });

      const result = await service.submitMatchFeedback(mockUserId, mockMatchId, 'Great match!');

      expect(matchModel.update).toHaveBeenCalledWith(
        { user_a_feedback: 'Great match!' },
        { where: { id: mockMatchId }, transaction: mockTransaction },
      );
    });

    it('should submit feedback as user B', async () => {
      const mockMatch = {
        id: mockMatchId,
        user_a_id: mockOtherUserId,
        user_b_id: mockUserId,
        user_a_feedback: null,
        user_b_feedback: null,
        get: jest.fn().mockReturnThis(),
      };

      matchModel.findOne.mockResolvedValue(mockMatch);
      matchModel.update.mockResolvedValue([1]);
      matchModel.findOne.mockResolvedValueOnce(mockMatch).mockResolvedValueOnce({
        id: mockMatchId,
        user_a_id: mockOtherUserId,
        user_b_id: mockUserId,
        user_a_feedback: null,
        user_b_feedback: 'Good experience',
        get: jest.fn(() => ({
          id: mockMatchId,
          user_a_id: mockOtherUserId,
          user_b_id: mockUserId,
          user_a_feedback: null,
          user_b_feedback: 'Good experience',
        })),
      });

      const result = await service.submitMatchFeedback(mockUserId, mockMatchId, 'Good experience');

      expect(matchModel.update).toHaveBeenCalledWith(
        { user_b_feedback: 'Good experience' },
        { where: { id: mockMatchId }, transaction: mockTransaction },
      );
    });

    it('should throw error if match not found', async () => {
      matchModel.findOne.mockResolvedValue(null);

      await expect(
        service.submitMatchFeedback(mockUserId, mockMatchId, 'Feedback'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if user not part of match', async () => {
      const mockMatch = {
        id: mockMatchId,
        user_a_id: 'other-user-1',
        user_b_id: 'other-user-2',
        user_a_feedback: null,
        user_b_feedback: null,
      };

      matchModel.findOne.mockResolvedValue(mockMatch);

      await expect(
        service.submitMatchFeedback(mockUserId, mockMatchId, 'Feedback'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should trim feedback', async () => {
      const mockMatch = {
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_feedback: null,
        user_b_feedback: null,
        get: jest.fn().mockReturnThis(),
      };

      matchModel.findOne.mockResolvedValue(mockMatch);
      matchModel.update.mockResolvedValue([1]);
      matchModel.findOne.mockResolvedValueOnce(mockMatch).mockResolvedValueOnce({
        id: mockMatchId,
        user_a_id: mockUserId,
        user_b_id: mockOtherUserId,
        user_a_feedback: 'Trimmed feedback',
        user_b_feedback: null,
        get: jest.fn(() => ({
          id: mockMatchId,
          user_a_id: mockUserId,
          user_b_id: mockOtherUserId,
          user_a_feedback: 'Trimmed feedback',
          user_b_feedback: null,
        })),
      });

      await service.submitMatchFeedback(mockUserId, mockMatchId, '  Trimmed feedback  ');

      expect(matchModel.update).toHaveBeenCalledWith(
        { user_a_feedback: 'Trimmed feedback' },
        { where: { id: mockMatchId }, transaction: mockTransaction },
      );
    });
  });

  describe('quickStats()', () => {
    it('should return all stats with correct structure', async () => {
      userModel.update.mockResolvedValue([1]);
      matchModel.findAll.mockResolvedValue([
        {
          total_matches: 100,
          successful_matches: 60,
          conversations: 40,
          perfect_matches: 20,
        },
      ]);

      const result = await service.quickStats(mockUserId);

      expect(result).toHaveProperty('total_matches');
      expect(result).toHaveProperty('successful_matches');
      expect(result).toHaveProperty('conversations');
      expect(result).toHaveProperty('perfect_matches');
    });

    it('should return numeric values', async () => {
      userModel.update.mockResolvedValue([1]);
      matchModel.findAll.mockResolvedValue([
        {
          total_matches: '100',
          successful_matches: '60',
          conversations: '40',
          perfect_matches: '20',
        },
      ]);

      const result = await service.quickStats(mockUserId);

      expect(typeof result.total_matches).toBe('number');
      expect(typeof result.successful_matches).toBe('number');
      expect(typeof result.conversations).toBe('number');
      expect(typeof result.perfect_matches).toBe('number');
    });

    it('should handle zero counts', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      userModel.update.mockResolvedValue([1]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      matchModel.findAll.mockResolvedValue([
        {
          total_matches: 0,
          successful_matches: 0,
          conversations: 0,
          perfect_matches: 0,
        },
      ]);

      const result = await service.quickStats(mockUserId);

      expect(result.total_matches).toBe(0);
      expect(result.successful_matches).toBe(0);
      expect(result.conversations).toBe(0);
      expect(result.perfect_matches).toBe(0);
    });
  });

  describe('aiMatchAnalytics()', () => {
    it('should return AI analytics with correct structure', async () => {
      matchModel.findAll.mockResolvedValue([
        {
          total: 100,
          u2u_true: 40,
          a2a_true: 60,
          persona_compat_sum: 7500,
        },
      ]);

      const result = await service.aiMatchAnalytics(mockUserId);

      expect(result).toHaveProperty('total_matches');
      expect(result).toHaveProperty('match_success_rate_after_ai_chat');
      expect(result).toHaveProperty('avg_persona_compatibility_score');
      expect(result).toHaveProperty('ai_chat_completion_rate');
    });

    it('should calculate percentages correctly', async () => {
      matchModel.findAll.mockResolvedValue([
        {
          total: 100,
          u2u_true: 40,
          a2a_true: 60,
          persona_compat_sum: 7500,
        },
      ]);

      const result = await service.aiMatchAnalytics(mockUserId);

      expect(result.match_success_rate_after_ai_chat).toBe(40);
      expect(result.ai_chat_completion_rate).toBe(60);
    });

    it('should handle zero matches', async () => {
      matchModel.findAll.mockResolvedValue([
        {
          total: 0,
          u2u_true: 0,
          a2a_true: 0,
          persona_compat_sum: 0,
        },
      ]);

      const result = await service.aiMatchAnalytics(mockUserId);

      expect(result.total_matches).toBe(0);
      expect(result.match_success_rate_after_ai_chat).toBe(0);
      expect(result.avg_persona_compatibility_score).toBe(0);
      expect(result.ai_chat_completion_rate).toBe(0);
    });
  });

  describe('countMatchesByStatus()', () => {
    it('should return counts for all status buckets', async () => {
      matchModel.count.mockResolvedValue(5);

      const result = await service.countMatchesByStatus(mockUserId, {});

      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('approved');
      expect(result).toHaveProperty('passed');
      expect(result.approved).toHaveProperty('approved');
      expect(result.approved).toHaveProperty('awaiting_other');
      expect(result.approved).toHaveProperty('total');
      expect(result.passed).toHaveProperty('passed_by_me');
      expect(result.passed).toHaveProperty('passed_by_other');
      expect(result.passed).toHaveProperty('passed');
      expect(result.passed).toHaveProperty('total');
    });

    it('should filter by date range', async () => {
      matchModel.count.mockResolvedValue(0);

      await service.countMatchesByStatus(mockUserId, {
        start_date: new Date('2025-01-01'),
        end_date: new Date('2025-12-31'),
      });

      expect(matchModel.count).toHaveBeenCalled();
    });
  });
});
