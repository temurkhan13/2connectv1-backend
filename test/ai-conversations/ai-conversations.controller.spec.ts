import { Test, TestingModule } from '@nestjs/testing';
import { AiConversationsController } from 'src/modules/ai-conversations/ai-conversations.controller';
import { AiConversationsService } from 'src/modules/ai-conversations/ai-conversations.service';
import { TriggerUserToUserDto } from 'src/modules/ai-conversations/dto/ai-conversation.dto';

describe('AiConversationsController', () => {
  let controller: AiConversationsController;
  let service: Partial<Record<keyof AiConversationsService, jest.Mock>>;

  beforeEach(async () => {
    service = {
      triggerUserToUser: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiConversationsController],
      providers: [
        {
          provide: AiConversationsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<AiConversationsController>(AiConversationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('triggerUserToUser', () => {
    it('calls service with initiator id and dto and returns result', async () => {
      const dto: TriggerUserToUserDto = { match_id: 'match-1', responder_id: 'resp-1' } as any;
      const fakeReq: any = { user: { id: 'initiator-1' } };
      const expected = { code: 200, message: 'ok', result: {} };

      (service.triggerUserToUser as jest.Mock).mockResolvedValue(expected);

      const res = await controller.triggerUserToUser(fakeReq, dto);

      expect(service.triggerUserToUser).toHaveBeenCalledWith('initiator-1', dto);
      expect(res).toBe(expected);
    });

    it('bubbles up errors from service', async () => {
      const dto: TriggerUserToUserDto = { match_id: 'match-1', responder_id: 'resp-1' } as any;
      const fakeReq: any = { user: { id: 'initiator-1' } };
      const err = new Error('boom');

      (service.triggerUserToUser as jest.Mock).mockRejectedValue(err);

      await expect(controller.triggerUserToUser(fakeReq, dto)).rejects.toThrow(err);
    });
  });
});
