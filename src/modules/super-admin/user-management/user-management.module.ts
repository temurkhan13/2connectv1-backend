import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Match } from 'src/common/entities/match.entity';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { User } from 'src/common/entities/user.entity';
import { UserManagementController } from 'src/modules/super-admin/user-management/user-management.controller';
import { UserManagementService } from 'src/modules/super-admin/user-management/user-management.service';

/**
 * UserManagementModule
 * --------------------
 * Purpose:
 * - Encapsulate admin user management operations in an isolated feature module.
 *
 * Summary:
 * - Imports Sequelize models for User, Documents, Summary, Activity Logs.
 * - Provides UserManagementService and UserManagementController.
 * - Scoped routes: /admin/users/list, /admin/users/search, /admin/users/:id.
 * - All endpoints enforce ADMIN role via guards.
 * - List API: pagination + filtering.
 * - Search API: basic info only, no pagination.
 * - Detail API: user + documents + summary + activity logs + match analytics.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([User, UserDocument, UserSummaries, UserActivityLog, Match]),
  ],
  controllers: [UserManagementController],
  providers: [UserManagementService],
  exports: [UserManagementService],
})
export class UserManagementModule {}
