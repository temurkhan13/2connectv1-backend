import { Module } from '@nestjs/common';
import { AdminAuthModule } from 'src/modules/super-admin/auth/auth.module';
import { DashboardModule } from 'src/modules/super-admin/dashboard/dashboard.module';
import { UserManagementModule } from 'src/modules/super-admin/user-management/user-management.module';

/**
 * SuperAdminModule
 * --------------------
 * Purpose:
 * - Container for admin/admin features.
 *
 * Summary:
 * - Imports AdminAuthModule for admin-only authentication endpoints.
 * - Imports UserManagementModule for admin user management endpoints.
 * - Future admin features (analytics, settings, etc.) can be added here.
 * - All child modules enforce role-based access control.
 */
@Module({
  imports: [AdminAuthModule, DashboardModule, UserManagementModule],
  controllers: [],
  providers: [],
})
export class SuperAdminModule {}
