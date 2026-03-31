import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatConversation } from 'src/common/entities/chat-conversation.entity';
import { ChatMessage } from 'src/common/entities/chat-message.entity';
import { BlockedUser } from 'src/common/entities/blocked-user.entity';
import { ReportedUser } from 'src/common/entities/reported-user.entity';

@Module({
  imports: [SequelizeModule.forFeature([ChatConversation, ChatMessage, BlockedUser, ReportedUser])],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
