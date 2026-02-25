import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DailyAnalytics } from 'src/common/entities/daily-analytics.entity';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';

@Module({
  imports: [SequelizeModule.forFeature([DailyAnalytics])],
  providers: [DailyAnalyticsService],
  exports: [DailyAnalyticsService],
})
export class DailyAnalyticsModule {}
