import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { User } from 'src/common/entities/user.entity';
import { RoleEnum } from 'src/common/enums';
import { Response } from 'express';
import { AdminAuthService } from 'src/modules/super-admin/auth/auth.service';

/**
 * AdminAuthService Tests
 * ----------------------
 * Purpose:
 * - Test admin authentication logic: login, logout, token generation.
 *
 * Test Coverage:
 * - Login success with valid credentials and ADMIN role
 * - Login failure with invalid credentials
 * - Login failure with non-admin user
 * - Login failure with non-existent user
 * - Logout functionality
 * - JWT token generation
 * - Cookie management
 */
describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let userModel: any;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    mockResponse = {
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        {
          provide: getModelToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    userModel = module.get(getModelToken(User));
  });

  describe('login', () => {
    it('should successfully login admin with valid credentials', async () => {
      const mockUser = {
        id: 'user-id-123',
        email: 'admin@test.com',
        password: await bcrypt.hash('password123', 12),
        first_name: 'Admin',
        last_name: 'User',
        role: { id: 'role-id-1', title: RoleEnum.ADMIN },
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(jwtService, 'sign').mockReturnValue('jwt-token');
      jest.spyOn(configService, 'get').mockReturnValue('development');

      const result = await service.login(
        { email: 'admin@test.com', password: 'password123' },
        mockResponse as Response,
      );

      expect(userModel.findOne).toHaveBeenCalledWith({
        where: { email: 'admin@test.com' },
        include: [{ all: true }],
      });
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('access_token', 'jwt-token');
      expect(result.user.email).toBe('admin@test.com');
      expect(mockResponse.cookie).toHaveBeenCalled();
    });

    it('should throw error with invalid password', async () => {
      const mockUser = {
        id: 'user-id-123',
        email: 'admin@test.com',
        password: await bcrypt.hash('password123', 12),
        first_name: 'Admin',
        last_name: 'User',
        role: { id: 'role-id-1', title: RoleEnum.ADMIN },
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);

      await expect(
        service.login(
          { email: 'admin@test.com', password: 'wrongpassword' },
          mockResponse as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error with non-existent user', async () => {
      jest.spyOn(userModel, 'findOne').mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'nonexistent@test.com', password: 'password123' },
          mockResponse as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error if user is not admin', async () => {
      const mockUser = {
        id: 'user-id-456',
        email: 'user@test.com',
        password: await bcrypt.hash('password123', 12),
        first_name: 'Regular',
        last_name: 'User',
        role: { id: 'role-id-2', title: RoleEnum.USER },
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);

      await expect(
        service.login(
          { email: 'user@test.com', password: 'password123' },
          mockResponse as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should set secure cookie in production', async () => {
      const mockUser = {
        id: 'user-id-123',
        email: 'admin@test.com',
        password: await bcrypt.hash('password123', 12),
        first_name: 'Admin',
        last_name: 'User',
        role: { id: 'role-id-1', title: RoleEnum.ADMIN },
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(jwtService, 'sign').mockReturnValue('jwt-token');
      jest.spyOn(configService, 'get').mockReturnValue('production');

      await service.login(
        { email: 'admin@test.com', password: 'password123' },
        mockResponse as Response,
      );

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        'jwt-token',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 96 * 60 * 60 * 1000,
        }),
      );
    });

    it('should return sanitized user data', async () => {
      const mockUser = {
        id: 'user-id-123',
        email: 'admin@test.com',
        password: await bcrypt.hash('password123', 12),
        first_name: 'Admin',
        last_name: 'User',
        role: { id: 'role-id-1', title: RoleEnum.ADMIN },
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(jwtService, 'sign').mockReturnValue('jwt-token');
      jest.spyOn(configService, 'get').mockReturnValue('development');

      const result = await service.login(
        { email: 'admin@test.com', password: 'password123' },
        mockResponse as Response,
      );

      expect(result.user).not.toHaveProperty('password');
      expect(result.user.id).toBe('user-id-123');
      expect(result.user.first_name).toBe('Admin');
      expect(result.user.last_name).toBe('User');
    });
  });

  describe('logout', () => {
    it('should clear access_token cookie', () => {
      const result = service.logout(mockResponse as Response);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        }),
      );
      expect(result).toBe(true);
    });

    it('should set secure flag in production', () => {
      jest.spyOn(configService, 'get').mockReturnValue('production');

      service.logout(mockResponse as Response);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({
          secure: true,
        }),
      );
    });
  });
});
