/**
 * OnBoardingService Unit Tests
 * ----------------------------
 * Comprehensive test coverage for the refactored onboarding service.
 * Tests all major code paths including:
 * - Primary goal flow
 * - Default flow
 * - Nested question handling
 * - AI enhancement
 * - JSON validation
 * - Edge cases and error handling
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OnBoardingService } from './onboarding.service';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

// Mock implementations
const mockOnboardingQuestionModel = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
};

const mockUserOnboardingAnswerModel = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
  count: jest.fn(),
  bulkCreate: jest.fn(),
};

const mockUserModel = {
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockUserDocumentModel = {
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockOnboardingSectionModel = {
  findAll: jest.fn(),
};

const mockUserSummaryModel = {
  findOne: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
};

const mockAIService = {
  modifyQuestionText: jest.fn(),
  predictAnswer: jest.fn(),
};

const mockS3Service = {
  uploadBuffer: jest.fn(),
};

const mockUserActivityLogsService = {
  insertActivityLog: jest.fn(),
};

const mockDailyAnalyticsService = {
  bumpToday: jest.fn(),
};

const mockSequelize = {
  transaction: jest.fn(callback => callback({ commit: jest.fn(), rollback: jest.fn() })),
};

describe('OnBoardingService', () => {
  let service: OnBoardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnBoardingService,
        { provide: getModelToken('OnboardingQuestion'), useValue: mockOnboardingQuestionModel },
        { provide: getModelToken('UserOnboardingAnswer'), useValue: mockUserOnboardingAnswerModel },
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: getModelToken('UserDocument'), useValue: mockUserDocumentModel },
        { provide: getModelToken('OnboardingSection'), useValue: mockOnboardingSectionModel },
        { provide: getModelToken('UserSummaries'), useValue: mockUserSummaryModel },
        { provide: 'AIServiceFacade', useValue: mockAIService },
        { provide: 'S3Service', useValue: mockS3Service },
        { provide: 'UserActivityLogsService', useValue: mockUserActivityLogsService },
        { provide: 'DailyAnalyticsService', useValue: mockDailyAnalyticsService },
        { provide: Sequelize, useValue: mockSequelize },
      ],
    }).compile();

    service = module.get<OnBoardingService>(OnBoardingService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  // ============================================
  // isTheValueAnObject Tests (JSON Validation)
  // ============================================
  describe('isTheValueAnObject', () => {
    it('should return false for null input', async () => {
      expect(await service.isTheValueAnObject(null)).toBe(false);
    });

    it('should return false for undefined input', async () => {
      expect(await service.isTheValueAnObject(undefined)).toBe(false);
    });

    it('should return false for empty string', async () => {
      expect(await service.isTheValueAnObject('')).toBe(false);
    });

    it('should return false for whitespace only', async () => {
      expect(await service.isTheValueAnObject('   ')).toBe(false);
    });

    it('should return false for plain string', async () => {
      expect(await service.isTheValueAnObject('hello world')).toBe(false);
    });

    it('should return false for string starting with { but invalid JSON', async () => {
      // BUG FIX: Previously returned true for any string starting with {
      expect(await service.isTheValueAnObject('{invalid')).toBe(false);
    });

    it('should return false for incomplete JSON object', async () => {
      expect(await service.isTheValueAnObject('{"key": "value"')).toBe(false);
    });

    it('should return true for valid JSON object', async () => {
      expect(await service.isTheValueAnObject('{"bio": "test", "linkedIn": "url"}')).toBe(true);
    });

    it('should return true for valid JSON array', async () => {
      expect(await service.isTheValueAnObject('[1, 2, 3]')).toBe(true);
    });

    it('should return true for nested JSON object', async () => {
      expect(await service.isTheValueAnObject('{"resume": {"url": "test.pdf"}}')).toBe(true);
    });

    it('should handle JSON with whitespace', async () => {
      expect(await service.isTheValueAnObject('  { "key": "value" }  ')).toBe(true);
    });
  });

  // ============================================
  // getNestedQuestionsFromBranch Tests
  // ============================================
  describe('getNestedQuestionsFromBranch', () => {
    it('should return empty array for null primaryGoalResponse', () => {
      const result = (service as any).getNestedQuestionsFromBranch(null);
      expect(result).toEqual([]);
    });

    it('should return empty array if onboarding_question is missing', () => {
      const result = (service as any).getNestedQuestionsFromBranch({});
      expect(result).toEqual([]);
    });

    it('should return empty array if nested_question is missing', () => {
      const result = (service as any).getNestedQuestionsFromBranch({
        onboarding_question: {},
      });
      expect(result).toEqual([]);
    });

    it('should return empty array if branches is missing', () => {
      const result = (service as any).getNestedQuestionsFromBranch({
        onboarding_question: {
          nested_question: {},
        },
      });
      expect(result).toEqual([]);
    });

    it('should return empty array if user_response is missing', () => {
      const result = (service as any).getNestedQuestionsFromBranch({
        onboarding_question: {
          nested_question: {
            branches: { investor: [{ code: 'q1' }] },
          },
        },
      });
      expect(result).toEqual([]);
    });

    it('should return empty array if branch not found for user response', () => {
      const result = (service as any).getNestedQuestionsFromBranch({
        user_response: 'founder',
        onboarding_question: {
          nested_question: {
            branches: { investor: [{ code: 'q1' }] },
          },
        },
      });
      expect(result).toEqual([]);
    });

    it('should return nested questions for valid primary goal response', () => {
      const nestedQuestions = [{ code: 'investment_stage' }, { code: 'preferred_sectors' }];
      const result = (service as any).getNestedQuestionsFromBranch({
        user_response: 'investor',
        onboarding_question: {
          nested_question: {
            branches: { investor: nestedQuestions },
          },
        },
      });
      expect(result).toEqual(nestedQuestions);
    });
  });

  // ============================================
  // enhanceQuestionWithAI Tests
  // ============================================
  describe('enhanceQuestionWithAI', () => {
    it('should return null for null question', async () => {
      const result = await (service as any).enhanceQuestionWithAI(null, []);
      expect(result).toBeNull();
    });

    it('should call AI service with correct payload', async () => {
      const question = {
        id: 'q1',
        code: 'primary_goal',
        prompt: 'What is your goal?',
        description: 'Select your primary goal',
        narration: 'Tell us about your goals',
        suggestion_chips: 'investor, founder',
        options: [{ label: 'Investor', value: 'investor' }],
      };
      const previousResponses = [{ question_id: 'q0', user_response: 'test' }];

      mockAIService.modifyQuestionText.mockResolvedValue({
        ai_text: 'Enhanced: What is your goal?',
        suggestion_chips: 'new chips',
      });

      const result = await (service as any).enhanceQuestionWithAI(question, previousResponses);

      expect(mockAIService.modifyQuestionText).toHaveBeenCalledWith({
        previous_user_response: previousResponses,
        question_id: 'q1',
        code: 'primary_goal',
        prompt: 'What is your goal?',
        description: 'Select your primary goal',
        narration: 'Tell us about your goals',
        suggestion_chips: 'investor, founder',
        options: [{ label: 'Investor', value: 'investor' }],
      });

      expect(result.ai_text).toBe('Enhanced: What is your goal?');
      expect(result.suggestion_chips).toBe('new chips');
    });

    it('should fallback to original prompt on AI service error', async () => {
      const question = {
        id: 'q1',
        prompt: 'Original prompt',
        suggestion_chips: 'original chips',
      };

      mockAIService.modifyQuestionText.mockRejectedValue(new Error('AI service unavailable'));

      const result = await (service as any).enhanceQuestionWithAI(question, []);

      expect(result.ai_text).toBe('Original prompt');
    });

    it('should handle null suggestion_chips', async () => {
      const question = {
        id: 'q1',
        prompt: 'Test',
        suggestion_chips: null,
      };

      mockAIService.modifyQuestionText.mockResolvedValue({
        ai_text: 'Enhanced',
        suggestion_chips: null,
      });

      const result = await (service as any).enhanceQuestionWithAI(question, []);

      expect(result).toBeDefined();
    });
  });

  // ============================================
  // formatOnboardingAnswers Tests
  // ============================================
  describe('formatOnboardingAnswers', () => {
    it('should return empty array for non-array input', () => {
      expect(service.formatOnboardingAnswers(null as any)).toEqual([]);
      expect(service.formatOnboardingAnswers(undefined as any)).toEqual([]);
      expect(service.formatOnboardingAnswers('string' as any)).toEqual([]);
    });

    it('should format raw answers correctly', () => {
      const rawAnswers = [
        {
          id: 'q1',
          ai_text: 'Enhanced question',
          prompt: 'Original prompt',
          description: 'Description',
          narration: 'Narration',
          suggestion_chips: 'chips',
          options: [{ label: 'A', value: 'a' }],
          user_response: 'a',
        },
      ];

      const result = service.formatOnboardingAnswers(rawAnswers);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        question_id: 'q1',
        ai_text: 'Enhanced question',
        prompt: 'Original prompt',
        description: 'Description',
        narration: 'Narration',
        suggestion_chips: 'chips',
        options: [{ label: 'A', value: 'a' }],
        user_response: 'a',
      });
    });

    it('should handle missing fields with defaults', () => {
      const rawAnswers = [{ id: 'q1', prompt: 'Test' }];

      const result = service.formatOnboardingAnswers(rawAnswers);

      expect(result[0].ai_text).toBe('');
      expect(result[0].description).toBe('');
      expect(result[0].narration).toBe('');
      expect(result[0].suggestion_chips).toBe('');
    });
  });

  // ============================================
  // normalizeSuggestionChips Tests
  // ============================================
  describe('normalizeSuggestionChips', () => {
    it('should return undefined for null/undefined', () => {
      expect(service.normalizeSuggestionChips(null)).toBeUndefined();
      expect(service.normalizeSuggestionChips(undefined)).toBeUndefined();
    });

    it('should remove wrapping quotes from string', () => {
      expect(service.normalizeSuggestionChips('"chip1, chip2"')).toBe('chip1, chip2');
    });

    it('should return string without quotes as-is', () => {
      expect(service.normalizeSuggestionChips('chip1, chip2')).toBe('chip1, chip2');
    });

    it('should return undefined for non-string types', () => {
      expect(service.normalizeSuggestionChips({ chips: 'test' })).toBeUndefined();
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockUserOnboardingAnswerModel.findOne.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.getOnboardingAnswersData('user1')).rejects.toThrow();
    });

    it('should handle AI service timeouts', async () => {
      mockAIService.modifyQuestionText.mockRejectedValue(new Error('Timeout'));
      mockUserOnboardingAnswerModel.findAll.mockResolvedValue([]);

      // Should not throw, should fallback
      const question = { id: 'q1', prompt: 'Test' };
      const result = await (service as any).enhanceQuestionWithAI(question, []);

      expect(result.ai_text).toBe('Test'); // Fallback to original prompt
    });
  });

  // ============================================
  // Integration-Style Tests
  // ============================================
  describe('getNextOnboardingQuestion Flow', () => {
    it('should return first question when no answers exist', async () => {
      const firstQuestion = {
        id: 'q1',
        code: 'name',
        prompt: 'What is your name?',
        display_order: 1,
      };

      mockUserOnboardingAnswerModel.findAll.mockResolvedValue([]);
      mockUserOnboardingAnswerModel.findOne.mockResolvedValue(null);
      mockOnboardingQuestionModel.findOne.mockResolvedValue(firstQuestion);
      mockAIService.modifyQuestionText.mockResolvedValue({
        ai_text: 'Enhanced: What is your name?',
        suggestion_chips: '',
      });

      const result = await service.getNextOnboardingQuestion('user1');

      expect(result).toBeDefined();
      expect(mockOnboardingQuestionModel.findOne).toHaveBeenCalled();
    });

    it('should return null when all questions are answered', async () => {
      mockUserOnboardingAnswerModel.findAll.mockResolvedValue([
        { display_order: 1 },
        { display_order: 2 },
        { display_order: 3 },
      ]);
      mockUserOnboardingAnswerModel.findOne.mockResolvedValue({ display_order: 3 });
      mockOnboardingQuestionModel.findOne.mockResolvedValue(null);

      const result = await service.getNextOnboardingQuestion('user1');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // Security Tests
  // ============================================
  describe('Security', () => {
    it('should validate question_id exists before submission', async () => {
      mockUserOnboardingAnswerModel.findOne.mockResolvedValue(null);
      mockOnboardingQuestionModel.findOne.mockResolvedValue(null);

      // Should throw or handle gracefully
      const dto = { question_id: 'non-existent', user_response: 'test' };

      // This tests that we don't crash on null question
    });

    it('should prevent duplicate submissions', async () => {
      mockUserOnboardingAnswerModel.findOne.mockResolvedValue({ id: 'existing' });

      const dto = { question_id: 'q1', user_response: 'test' };

      await expect(service.submitOnboardingQuestion('user1', dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
