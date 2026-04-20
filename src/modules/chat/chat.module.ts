import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatConversation } from 'src/common/entities/chat-conversation.entity';
import { ChatMessage } from 'src/common/entities/chat-message.entity';
import { BlockedUser } from 'src/common/entities/blocked-user.entity';
import { ReportedUser } from 'src/common/entities/reported-user.entity';
import { User } from 'src/common/entities/user.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { S3Service } from 'src/common/utils/s3.service';

@Module({
  imports: [
    // User added for email lookups in reportUser (abuse-report admin notification)
    SequelizeModule.forFeature([ChatConversation, ChatMessage, BlockedUser, ReportedUser, User]),
    NotificationModule,
    MailModule, // abuse-report admin notification ([[Analyses/ugc-moderation-gap-spec]])
  ],
  controllers: [ChatController],
  providers: [ChatService, S3Service],
  exports: [ChatService],
})
export class ChatModule {}
