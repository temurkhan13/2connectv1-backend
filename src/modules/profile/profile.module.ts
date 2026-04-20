import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProfileService } from 'src/modules/profile/profile.service';
import { ProfileController } from 'src/modules/profile/profile.controller';
import { UserModule } from 'src/modules/user/user.module';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { MessageTemplate } from 'src/common/entities/message-template.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { User } from 'src/common/entities/user.entity';
import { S3Module } from 'src/common/utils/s3.module';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';
import { AIServiceModule } from 'src/integration/ai-service/ai-service.module';

@Module({
  imports: [
    UserActivityLogsModule,
    SequelizeModule.forFeature([UserDocument, MessageTemplate, UserSummaries, User]),
    UserModule,
    AIServiceModule,
    S3Module, // F/u 47: was `S3Service` in providers; centralized to S3Module
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
