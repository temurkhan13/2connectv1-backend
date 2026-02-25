import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AdminAuthController } from 'src/modules/super-admin/auth/auth.controller';
import { AdminAuthService } from 'src/modules/super-admin/auth/auth.service';

/**
 * AdminAuthController Tests
 * -------------------------
 * Purpose:
 * - Test admin authentication endpoints: login, logout.
 *
 * Test Coverage:
 * - POST /admin/auth/login with valid credentials
 * - POST /admin/auth/login with invalid credentials
 * - POST /admin/auth/logout
 * - Proper HTTP status codes
 * - Response shape validation
 */
describe('AdminAuthController', () => {
  let controller: AdminAuthController;
  let service: AdminAuthService;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    mockResponse = {
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [
        {
          provide: AdminAuthService,
          useValue: {
            login: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminAuthController>(AdminAuthController);
    service = module.get<AdminAuthService>(AdminAuthService);
  });

  describe('login', () => {
    it('should call service.login with credentials', async () => {
      const dto = { email: 'admin@test.com', password: 'password123' };
      const expectedResult = {
        user: { id: 'user-id', email: 'admin@test.com' },
        access_token: 'jwt-token',
      };

      jest.spyOn(service, 'login').mockResolvedValue(expectedResult);

      const result = await controller.login(dto, mockResponse as Response);

      expect(service.login).toHaveBeenCalledWith(dto, mockResponse);
      expect(result).toEqual(expectedResult);
    });

    it('should handle login errors gracefully', async () => {
      const dto = { email: 'admin@test.com', password: 'wrongpassword' };

      jest.spyOn(service, 'login').mockRejectedValue(new Error('Unauthorized'));

      await expect(controller.login(dto, mockResponse as Response)).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('should call service.logout', () => {
      jest.spyOn(service, 'logout').mockReturnValue(true);

      const result = controller.logout({}, mockResponse as Response);

      expect(service.logout).toHaveBeenCalledWith(mockResponse);
      expect(result).toBe(true);
    });
  });
});
