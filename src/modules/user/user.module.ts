import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserService } from 'src/modules/user/user.service';
import { UserController } from 'src/modules/user/user.controller';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { Role } from 'src/common/entities/role.entity';
import { UserFcmToken } from 'src/common/entities/user-fcm-token.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';

@Module({
  imports: [SequelizeModule.forFeature([User, Match, Role, UserFcmToken, UserSummaries])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
