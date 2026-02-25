import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { SchedulerService } from 'src/modules/scheduler/scheduler.service';
import { MailModule } from 'src/modules/mail/mail.module';
import { AIServiceModule } from 'src/integration/ai-service/ai-service.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule, MailModule, AIServiceModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
