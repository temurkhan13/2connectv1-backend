import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserService } from 'src/modules/user/user.service';
import { UserController } from 'src/modules/user/user.controller';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { Role } from 'src/common/entities/role.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { NotificationSettings } from 'src/common/entities/notification-settings.entity';
import { MailModule } from 'src/modules/mail/mail.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      User,
      Match,
      Role,
      UserSummaries,
      NotificationSettings,
    ]),
    // Account deletion confirmation email ([[Analyses/account-deletion-spec]])
    MailModule,
    // FCM token cleanup on account deletion
    NotificationModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
