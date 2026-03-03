import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProfileService } from 'src/modules/profile/profile.service';
import { ProfileController } from 'src/modules/profile/profile.controller';
import { UserModule } from 'src/modules/user/user.module';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { MessageTemplate } from 'src/common/entities/message-template.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { User } from 'src/common/entities/user.entity';
import { S3Service } from 'src/common/utils/s3.service';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';

@Module({
  imports: [
    UserActivityLogsModule,
    SequelizeModule.forFeature([UserDocument, MessageTemplate, UserSummaries, User]),
    UserModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService, S3Service],
  exports: [ProfileService],
})
export class ProfileModule {}
