import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { SchedulerService } from 'src/modules/scheduler/scheduler.service';
import { MailModule } from 'src/modules/mail/mail.module';
import { AIServiceModule } from 'src/integration/ai-service/ai-service.module';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule, MailModule, AIServiceModule, SequelizeModule.forFeature([UserSummaries])],
  providers: [SchedulerService],
})
export class SchedulerModule {}
