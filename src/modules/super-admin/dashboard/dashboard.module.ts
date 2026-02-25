import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Match } from 'src/common/entities/match.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { User } from 'src/common/entities/user.entity';
import { DashboardController } from 'src/modules/super-admin/dashboard/dashboard.controller';
import { DashboardService } from 'src/modules/super-admin/dashboard/dashboard.service';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';

/**
 * DashboardModule
 * ---------------
 * Purpose:
 * - Module for dashboard-related operations.
 *
 * Summary:
 * - Provides dashboard counts for super-admin.
 */
@Module({
  imports: [SequelizeModule.forFeature([User, UserSummaries, Match, AiConversation])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
