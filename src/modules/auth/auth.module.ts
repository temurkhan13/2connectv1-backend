import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from 'src/modules/auth/auth.controller';
import { AuthService } from 'src/modules/auth/auth.service';
import { User } from 'src/common/entities/user.entity';
import { Role } from 'src/common/entities/role.entity';
import { JwtStrategy } from 'src/modules/auth/jwt.strategy';
import { UserModule } from 'src/modules/user/user.module';
import { TempJwtStrategy } from 'src/modules/auth/temp-jwt.strategy';
import { VerificationCode } from 'src/common/entities/verification-code.entity';
import { DailyAnalyticsModule } from 'src/modules/daily-analytics/daily-analytics.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';

@Module({
  imports: [
    DailyAnalyticsModule,
    UserActivityLogsModule,
    SequelizeModule.forFeature([User, Role, VerificationCode]),
    UserModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '96h' },
      }),
      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      useFactory: (cs: ConfigService) => ({
        secret: cs.get<string>('TEMP_JWT_SECRET'),
        signOptions: {
          expiresIn: cs.get<string>('TEMP_JWT_EXPIRES_IN') || '15m', // 5m default
          issuer: cs.get<string>('TEMP_JWT_ISS'),
          audience: cs.get<string>('TEMP_JWT_AUD'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TempJwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
