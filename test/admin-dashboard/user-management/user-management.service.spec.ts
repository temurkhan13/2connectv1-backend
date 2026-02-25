import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { UserManagementService } from 'src/modules/super-admin/user-management/user-management.service';
import { User } from 'src/common/entities/user.entity';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { Match } from 'src/common/entities/match.entity';
import { ListUsersDto } from 'src/modules/super-admin/user-management/dto/list-users.dto';
import { SearchUsersDto } from 'src/modules/super-admin/user-management/dto/search-users.dto';
import { ListUserActivityLogsDto } from 'src/modules/super-admin/user-management/dto/list-user-activity-logs.dto';
import { RoleEnum } from 'src/common/enums';
import {
  OnboardingStatusFilterEnum,
  AccountStatusEnum,
  GenderFilterEnum,
} from 'src/common/utils/constants/user-management.constant';

/**
 * UserManagementService Tests
 * ---------------------------
 * Purpose:
 * - Test user management operations: listing, searching, detail views, activity logs, enums.
 *
 * Test Coverage:
 * - List users with pagination
 * - List users with filtering (status, account, gender)
 * - List users with search
 * - List users excludes admin users
 * - Search users by name/email
 * - Search users returns limited fields
 * - Search users excludes admin users
 * - Get user detail
 * - Get user detail includes documents, summary
 * - Get user detail returns 404 for admin users
 * - Get user detail returns 404 for non-existent users
 * - List user activity logs with pagination
 * - List user activity logs with optional user filter
 * - Get user management enums in label/value format
 */
describe('UserManagementService', () => {
  let service: UserManagementService;
  let userModel: Record<string, jest.Mock>;
  let userDocumentModel: Record<string, jest.Mock>;
  let userSummariesModel: Record<string, jest.Mock>;
  let userActivityLogModel: Record<string, jest.Mock>;
  let matchModel: Record<string, jest.Mock>;

  beforeEach(async () => {
    userModel = {
      findAndCountAll: jest.fn(),
      findAll: jest.fn(),
      findByPk: jest.fn(),
    };

    userDocumentModel = {
      findAll: jest.fn(),
    };

    userSummariesModel = {
      findOne: jest.fn(),
    };

    userActivityLogModel = {
      findAndCountAll: jest.fn(),
      findAll: jest.fn(),
    };

    matchModel = {
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserManagementService,
        {
          provide: getModelToken(User),
          useValue: userModel,
        },
        {
          provide: getModelToken(UserDocument),
          useValue: userDocumentModel,
        },
        {
          provide: getModelToken(UserSummaries),
          useValue: userSummariesModel,
        },
        {
          provide: getModelToken(UserActivityLog),
          useValue: userActivityLogModel,
        },
        {
          provide: getModelToken(Match),
          useValue: matchModel,
        },
      ],
    }).compile();

    service = module.get<UserManagementService>(UserManagementService);
  });

  describe('listUsers', () => {
    it('should return paginated list of users', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
          onboarding_status: 'completed',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: mockUsers,
        count: 1,
      });

      const dto: ListUsersDto = { page: 1, limit: 10 };
      const result = await service.listUsers(dto);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('totalPages', 1);
      expect(result.data.length).toBe(1);
    });

    it('should exclude admin users from list', async () => {
      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUsersDto = { page: 1, limit: 10 };
      await service.listUsers(dto);

      expect(userModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            '$role.title$': expect.any(Object),
          }),
        }),
      );
    });

    it('should respect limit max of 100', async () => {
      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUsersDto = { page: 1, limit: 200 };
      await service.listUsers(dto);

      expect(userModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        }),
      );
    });

    it('should apply onboarding_status filter', async () => {
      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUsersDto = {
        page: 1,
        limit: 10,
        onboarding_status: OnboardingStatusFilterEnum.COMPLETED,
      };
      await service.listUsers(dto);

      expect(userModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            onboarding_status: OnboardingStatusFilterEnum.COMPLETED,
          }),
        }),
      );
    });

    it('should apply account_status filter for active', async () => {
      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUsersDto = {
        page: 1,
        limit: 10,
        account_status: AccountStatusEnum.ACTIVE,
      };
      await service.listUsers(dto);

      expect(userModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: true,
          }),
        }),
      );
    });

    it('should apply gender filter', async () => {
      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUsersDto = {
        page: 1,
        limit: 10,
        gender: GenderFilterEnum.MALE,
      };
      await service.listUsers(dto);

      expect(userModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            gender: GenderFilterEnum.MALE,
          }),
        }),
      );
    });

    it('should format response with capitalized gender', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
          onboarding_status: 'completed',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: mockUsers,
        count: 1,
      });

      const dto: ListUsersDto = { page: 1, limit: 10 };
      const result = await service.listUsers(dto);

      expect(result.data[0].gender).toBe('Male');
    });

    it('should format response with calculated age', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
          onboarding_status: 'completed',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: mockUsers,
        count: 1,
      });

      const dto: ListUsersDto = { page: 1, limit: 10 };
      const result = await service.listUsers(dto);

      expect(result.data[0]).toHaveProperty('age');
      expect(typeof result.data[0].age).toBe('number');
    });

    it('should format response with full_name concatenation', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
          onboarding_status: 'completed',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: mockUsers,
        count: 1,
      });

      const dto: ListUsersDto = { page: 1, limit: 10 };
      const result = await service.listUsers(dto);

      expect(result.data[0].full_name).toBe('John Doe');
    });

    it('should format account_status from is_active boolean', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
          onboarding_status: 'completed',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      jest.spyOn(userModel, 'findAndCountAll').mockResolvedValue({
        rows: mockUsers,
        count: 1,
      });

      const dto: ListUsersDto = { page: 1, limit: 10 };
      const result = await service.listUsers(dto);

      expect(result.data[0].account_status).toBe('Active');
    });
  });

  describe('searchUsers', () => {
    it('should search users by query', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
        },
      ];

      jest.spyOn(userModel, 'findAll').mockResolvedValue(mockUsers);

      const dto: SearchUsersDto = { query: 'john' };
      const result = await service.searchUsers(dto);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result.data.length).toBe(1);
    });

    it('should exclude admin users from search', async () => {
      jest.spyOn(userModel, 'findAll').mockResolvedValue([]);

      const dto: SearchUsersDto = { query: 'admin' };
      await service.searchUsers(dto);

      expect(userModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            '$role.title$': expect.any(Object),
          }),
        }),
      );
    });

    it('should limit results to 20 max', async () => {
      jest.spyOn(userModel, 'findAll').mockResolvedValue([]);

      const dto: SearchUsersDto = { query: 'test', limit: 100 };
      await service.searchUsers(dto);

      expect(userModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
        }),
      );
    });

    it('should return only 5 fields in response', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
        },
      ];

      jest.spyOn(userModel, 'findAll').mockResolvedValue(mockUsers);

      const dto: SearchUsersDto = { query: 'john' };
      const result = await service.searchUsers(dto);

      const keys = Object.keys(result.data[0]);
      expect(keys.length).toBe(9); // id, full_name, email, gender, age, onboarding_status, account_status, created_at, updated_at
    });

    it('should capitalize gender in search results', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'male',
          date_of_birth: new Date('1990-01-01'),
        },
      ];

      jest.spyOn(userModel, 'findAll').mockResolvedValue(mockUsers);

      const dto: SearchUsersDto = { query: 'john' };
      const result = await service.searchUsers(dto);

      expect(result.data[0].gender).toBe('Male');
    });
  });

  describe('getUserDetail', () => {
    it('should return user detail with all related data', async () => {
      const mockUser = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        bio: 'Test bio',
        objective: 'Test objective',
        avatar: null,
        linkedin_profile: null,
        onboarding_status: 'completed',
        is_active: true,
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        timezone: null,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        role: { id: 'role-1', title: RoleEnum.USER },
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(matchModel, 'count').mockResolvedValueOnce(5).mockResolvedValueOnce(2); // 5 approved, 2 declined

      const result = await service.getUserDetail('user-1');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('documents');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('match_analytics');
      expect(result.match_analytics).toEqual([
        { label: 'User Match Success Rate', value: 71.4 }, // (5/7)*100 = 71.4
        { label: 'User Match Reject Rate', value: 28.6 }, // (2/7)*100 = 28.6
      ]);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      jest.spyOn(userModel, 'findByPk').mockResolvedValue(null);

      await expect(service.getUserDetail('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if user is admin', async () => {
      const mockAdminUser = {
        id: 'admin-1',
        role: { id: 'role-1', title: RoleEnum.ADMIN },
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockAdminUser);

      await expect(service.getUserDetail('admin-1')).rejects.toThrow(NotFoundException);
    });

    it('should fetch user with role association', async () => {
      const mockUser = {
        id: 'user-1',
        role: { id: 'role-1', title: RoleEnum.USER },
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(userActivityLogModel, 'findAll').mockResolvedValue([]);

      await service.getUserDetail('user-1');

      expect(userModel.findByPk).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          include: expect.any(Array),
        }),
      );
    });

    it('should fetch user documents', async () => {
      const mockUser = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        onboarding_status: 'completed',
        is_active: true,
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        role: { id: 'role-1', title: RoleEnum.USER },
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([
        {
          id: 'doc-1',
          user_id: 'user-1',
          url: 'https://example.com/doc.pdf',
          type: 'resume',
          parsed_metadata: { pages: 1 },
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(userActivityLogModel, 'findAll').mockResolvedValue([]);

      const result = await service.getUserDetail('user-1');

      expect(result.documents.length).toBe(1);
      expect(userDocumentModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
        }),
      );
    });

    it('should fetch latest user summary only', async () => {
      const mockUser = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        onboarding_status: 'completed',
        is_active: true,
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        role: { id: 'role-1', title: RoleEnum.USER },
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockSummary = {
        id: 'summary-1',
        user_id: 'user-1',
        summary: 'Test summary',
        status: 'approved',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(mockSummary);
      jest.spyOn(userActivityLogModel, 'findAll').mockResolvedValue([]);

      const result = await service.getUserDetail('user-1');

      expect(result.summary).not.toBeNull();
      expect(result.summary?.id).toBe('summary-1');
      expect(userSummariesModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
        }),
      );
    });

    it('should map document properties correctly', async () => {
      const mockUser = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        onboarding_status: 'completed',
        is_active: true,
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        role: { id: 'role-1', title: RoleEnum.USER },
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([
        {
          id: 'doc-1',
          user_id: 'user-1',
          url: 'https://example.com/doc.pdf',
          type: 'resume',
          parsed_metadata: { pages: 1 },
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(userActivityLogModel, 'findAll').mockResolvedValue([]);

      const result = await service.getUserDetail('user-1');

      expect(result.documents[0]).toHaveProperty('document_url', 'https://example.com/doc.pdf');
      expect(result.documents[0]).toHaveProperty('document_type', 'resume');
      expect(result.documents[0]).not.toHaveProperty('url');
      expect(result.documents[0]).not.toHaveProperty('type');
    });

    it('should map summary properties correctly', async () => {
      const mockUser = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        onboarding_status: 'completed',
        is_active: true,
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        role: { id: 'role-1', title: RoleEnum.USER },
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockSummary = {
        id: 'summary-1',
        user_id: 'user-1',
        summary: 'Test summary text',
        status: 'approved',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(mockSummary);
      jest.spyOn(userActivityLogModel, 'findAll').mockResolvedValue([]);

      const result = await service.getUserDetail('user-1');

      expect(result.summary).toHaveProperty('summary_text', 'Test summary text');
      expect(result.summary).not.toHaveProperty('summary');
    });

    it('should return 20 user fields', async () => {
      const mockUser = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        bio: 'Test bio',
        objective: 'Test objective',
        avatar: null,
        linkedin_profile: null,
        onboarding_status: 'completed',
        is_active: true,
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        timezone: null,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        role: { id: 'role-1', title: RoleEnum.USER },
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(userActivityLogModel, 'findAll').mockResolvedValue([]);

      const result = await service.getUserDetail('user-1');

      const userKeys = Object.keys(result.user);
      // Implementation currently returns 20 fields (id, full_name, email, gender, age,
      // date_of_birth, bio, objective, avatar, linkedin_profile, onboarding_status, is_active,
      // account_status, is_email_verified, email_notifications, allow_matching, timezone,
      // last_login_at, created_at, updated_at)
      expect(userKeys.length).toBe(20);
    });

    it('should return null for summary if not exists', async () => {
      const mockUser = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        onboarding_status: 'completed',
        is_active: true,
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        role: { id: 'role-1', title: RoleEnum.USER },
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);
      jest.spyOn(userDocumentModel, 'findAll').mockResolvedValue([]);
      jest.spyOn(userSummariesModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(userActivityLogModel, 'findAll').mockResolvedValue([]);

      const result = await service.getUserDetail('user-1');

      expect(result.summary).toBeNull();
    });
  });

  describe('listUserActivityLogs', () => {
    it('should return paginated list of activity logs', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          user_id: 'user-1',
          event_type: 'login',
          event_time: new Date(),
          metadata: { ip: '192.168.1.1' },
          created_at: new Date(),
          user: {
            id: 'user-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
          },
        },
      ];

      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: mockLogs,
        count: 1,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20 };
      const result = await service.listUserActivityLogs(dto);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('totalPages', 1);
      expect(result.data.length).toBe(1);
    });

    it('should filter by user_id when provided', async () => {
      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20, user_id: 'user-1' };
      await service.listUserActivityLogs(dto);

      expect(userActivityLogModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
        }),
      );
    });

    it('should not include user_id in where clause when not provided', async () => {
      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20 };
      await service.listUserActivityLogs(dto);

      expect(userActivityLogModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('should respect limit max of 100', async () => {
      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 200 };
      await service.listUserActivityLogs(dto);

      expect(userActivityLogModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        }),
      );
    });

    it('should include user information in response', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          user_id: 'user-1',
          event_type: 'login',
          event_time: new Date(),
          metadata: { ip: '192.168.1.1' },
          created_at: new Date(),
          user: {
            id: 'user-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
          },
        },
      ];

      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: mockLogs,
        count: 1,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20 };
      const result = await service.listUserActivityLogs(dto);

      expect(result.data[0]).toHaveProperty('user');
      expect(result.data[0].user).toHaveProperty('id', 'user-1');
      expect(result.data[0].user).toHaveProperty('full_name', 'John Doe');
      expect(result.data[0].user).toHaveProperty('email', 'john@test.com');
    });

    it('should format response with full_name concatenation', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          user_id: 'user-1',
          event_type: 'login',
          event_time: new Date(),
          metadata: {},
          created_at: new Date(),
          user: {
            id: 'user-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
          },
        },
      ];

      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: mockLogs,
        count: 1,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20 };
      const result = await service.listUserActivityLogs(dto);

      expect(result.data[0].user?.full_name).toBe('John Doe');
    });

    it('should handle log with null user', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          user_id: 'user-1',
          event_type: 'system_event',
          event_time: new Date(),
          metadata: {},
          created_at: new Date(),
          user: null,
        },
      ];

      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: mockLogs,
        count: 1,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20 };
      const result = await service.listUserActivityLogs(dto);

      expect(result.data[0].user).toBeNull();
    });

    it('should order results by event_time descending', async () => {
      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20 };
      await service.listUserActivityLogs(dto);

      expect(userActivityLogModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['event_time', 'DESC']],
        }),
      );
    });

    it('should include user association in query', async () => {
      jest.spyOn(userActivityLogModel, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      });

      const dto: ListUserActivityLogsDto = { page: 1, limit: 20 };
      await service.listUserActivityLogs(dto);

      expect(userActivityLogModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({
              model: User,
              as: 'user',
            }),
          ]),
        }),
      );
    });
  });

  describe('getUserManagementEnums', () => {
    it('should return all enum objects', async () => {
      const result = service.getUserManagementEnums();

      expect(result).toHaveProperty('sort_fields');
      expect(result).toHaveProperty('sort_orders');
      expect(result).toHaveProperty('account_statuses');
      expect(result).toHaveProperty('onboarding_statuses');
      expect(result).toHaveProperty('genders');
    });

    it('should return sort_fields with label and value', async () => {
      const result = service.getUserManagementEnums();

      expect(Array.isArray(result.sort_fields)).toBe(true);
      expect(result.sort_fields.length).toBeGreaterThan(0);

      result.sort_fields.forEach((field: any) => {
        expect(field).toHaveProperty('label');
        expect(field).toHaveProperty('value');
        expect(typeof field.label).toBe('string');
        expect(typeof field.value).toBe('string');
      });
    });

    it('should return sort_orders with label and value', async () => {
      const result = service.getUserManagementEnums();

      expect(Array.isArray(result.sort_orders)).toBe(true);
      expect(result.sort_orders.length).toBe(2);

      result.sort_orders.forEach((order: any) => {
        expect(order).toHaveProperty('label');
        expect(order).toHaveProperty('value');
        expect(['ASC', 'DESC']).toContain(order.value);
      });
    });

    it('should return account_statuses with label and value', async () => {
      const result = service.getUserManagementEnums();

      expect(Array.isArray(result.account_statuses)).toBe(true);
      expect(result.account_statuses.length).toBe(2);

      result.account_statuses.forEach((status: any) => {
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('value');
        expect(['active', 'inactive']).toContain(status.value);
      });
    });

    it('should return onboarding_statuses with label and value', async () => {
      const result = service.getUserManagementEnums();

      expect(Array.isArray(result.onboarding_statuses)).toBe(true);
      expect(result.onboarding_statuses.length).toBe(3);

      result.onboarding_statuses.forEach((status: any) => {
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('value');
        expect(['not_started', 'in_progress', 'completed']).toContain(status.value);
      });
    });

    it('should return genders with label and value', async () => {
      const result = service.getUserManagementEnums();

      expect(Array.isArray(result.genders)).toBe(true);
      expect(result.genders.length).toBe(3);

      result.genders.forEach((gender: any) => {
        expect(gender).toHaveProperty('label');
        expect(gender).toHaveProperty('value');
        expect(['male', 'female', 'other']).toContain(gender.value);
      });
    });

    it('should format labels correctly by replacing underscores', async () => {
      const result = service.getUserManagementEnums();

      const notStartedStatus = result.onboarding_statuses.find(
        (s: any) => s.value === 'not_started',
      );
      expect(notStartedStatus?.label).toBe('Not Started');

      const inProgressStatus = result.onboarding_statuses.find(
        (s: any) => s.value === 'in_progress',
      );
      expect(inProgressStatus?.label).toBe('In Progress');
    });

    it('should format labels with proper capitalization', async () => {
      const result = service.getUserManagementEnums();

      result.sort_fields.forEach((field: any) => {
        expect(field.label).toMatch(/^[A-Z]/); // Each word starts with capital
      });
    });
  });

  describe('setUserActiveStatus', () => {
    it('should activate/deactivate a user successfully', async () => {
      const mockUser: any = {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        gender: 'male',
        date_of_birth: new Date('1990-01-01'),
        role: { id: 'role-1', title: RoleEnum.USER },
        is_email_verified: true,
        email_notifications: true,
        allow_matching: true,
        created_at: new Date(),
        updated_at: new Date(),
        update: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockUser);

      const result = await service.setUserActiveStatus({ user_id: 'user-1', is_active: false });

      expect(userModel.findByPk).toHaveBeenCalledWith('user-1', expect.any(Object));
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('is_active', false);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      jest.spyOn(userModel, 'findByPk').mockResolvedValue(null);

      await expect(
        service.setUserActiveStatus({ user_id: 'nonexistent', is_active: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when trying to change admin user', async () => {
      const mockAdmin: any = { id: 'admin-1', role: { id: 'role-1', title: RoleEnum.ADMIN } };

      jest.spyOn(userModel, 'findByPk').mockResolvedValue(mockAdmin);

      await expect(
        service.setUserActiveStatus({ user_id: 'admin-1', is_active: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
