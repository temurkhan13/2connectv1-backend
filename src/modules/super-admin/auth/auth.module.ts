import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthController } from 'src/modules/super-admin/auth/auth.controller';
import { AdminAuthService } from 'src/modules/super-admin/auth/auth.service';
import { User } from 'src/common/entities/user.entity';
import { Role } from 'src/common/entities/role.entity';

/**
 * AdminAuthModule
 * ---------------
 * Purpose:
 * - Encapsulate admin authentication logic in an isolated feature module.
 *
 * Summary:
 * - Imports Sequelize models for User/Role lookup.
 * - Configures JWT for token generation (96h expiry).
 * - Provides AdminAuthService and AdminAuthController.
 * - Scoped routes: /admin/auth/* (login, logout).
 * - All endpoints enforce ADMIN role via guards.
 */
@Module({
  imports: [
    ConfigModule,
    SequelizeModule.forFeature([User, Role]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '96h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
