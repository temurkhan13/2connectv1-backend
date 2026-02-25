import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';

@Module({
  imports: [SequelizeModule.forFeature([UserActivityLog])],
  providers: [UserActivityLogsService],
  exports: [UserActivityLogsService],
})
export class UserActivityLogsModule {}
