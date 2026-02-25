import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AiConversationsService } from 'src/modules/ai-conversations/ai-conversations.service';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { Message } from 'src/common/entities/message.entity';
import { Match } from 'src/common/entities/match.entity';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';

describe('AiConversationsService', () => {
  let service: AiConversationsService;

  const mockAiConversationModel = {};
  const mockMessageModel = {};
  const mockMatchModel = {
    update: jest.fn().mockResolvedValue([1]),
  };

  const mockSequelize: any = {
    transaction: jest.fn(),
  };

  const mockAIService = {
    submitFeedback: jest.fn().mockResolvedValue(true),
  };

  const mockUserActivityLogsService = {
    insertActivityLog: jest.fn().mockResolvedValue(true),
  };

  const mockDailyAnalyticsService = {
    bumpToday: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    mockSequelize.transaction.mockImplementation(async cb => {
      const tx = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } } as any;
      return cb(tx);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiConversationsService,
        { provide: getModelToken(AiConversation), useValue: mockAiConversationModel },
        { provide: getModelToken(Message), useValue: mockMessageModel },
        { provide: getModelToken(Match), useValue: mockMatchModel },
        { provide: Sequelize, useValue: mockSequelize },
        { provide: AIServiceFacade, useValue: mockAIService },
        { provide: UserActivityLogsService, useValue: mockUserActivityLogsService },
        { provide: DailyAnalyticsService, useValue: mockDailyAnalyticsService },
      ],
    }).compile();

    service = module.get<AiConversationsService>(AiConversationsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('triggerUserToUser', () => {
    it('records activity logs, bumps analytics and updates match, then returns payload', async () => {
      const initiator = 'initiator-1';
      const dto = { match_id: 'match-1', responder_id: 'resp-1' } as any;

      const res = await service.triggerUserToUser(initiator, dto);

      expect(mockUserActivityLogsService.insertActivityLog).toHaveBeenCalledTimes(2);
      expect(mockUserActivityLogsService.insertActivityLog).toHaveBeenCalledWith(
        expect.any(String),
        initiator,
        expect.any(Object),
      );
      expect(mockUserActivityLogsService.insertActivityLog).toHaveBeenCalledWith(
        expect.any(String),
        dto.responder_id,
        expect.any(Object),
      );

      expect(mockDailyAnalyticsService.bumpToday).toHaveBeenCalledWith(
        'conversations_user_to_user',
        expect.objectContaining({ by: 1, transaction: expect.any(Object) }),
      );

      expect(mockMatchModel.update).toHaveBeenCalledWith(
        { user_to_user_conversation: true },
        { where: { id: dto.match_id }, transaction: expect.any(Object) },
      );

      expect(res).toEqual({
        code: 200,
        message: 'ok',
        result: { match_id: dto.match_id, initiator_id: initiator, responder_id: dto.responder_id },
      });
    });

    it('propagates errors from underlying services', async () => {
      const initiator = 'initiator-1';
      const dto = { match_id: 'match-1', responder_id: 'resp-1' } as any;

      mockUserActivityLogsService.insertActivityLog.mockRejectedValueOnce(new Error('fail'));

      await expect(service.triggerUserToUser(initiator, dto)).rejects.toThrow('fail');
    });
  });
});
