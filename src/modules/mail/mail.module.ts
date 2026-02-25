import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bull';
import { MailService } from 'src/modules/mail/mail.service';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';
import { WeeklyMatchEmailProcessor } from 'src/modules/mail/match-mail.processor';

@Module({
  imports: [
    SequelizeModule.forFeature([Match, User]),
    ConfigModule,
    BullModule.registerQueue({
      name: 'weekly-match-email',
    }),
  ],
  providers: [MailService, WeeklyMatchEmailProcessor],
  exports: [MailService],
})
export class MailModule {}
