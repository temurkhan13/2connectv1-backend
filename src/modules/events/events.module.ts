import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event, EventParticipant, EventMatchBadge } from 'src/common/entities/event.entity';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Event, EventParticipant, EventMatchBadge, Match, User]),
    NotificationModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
