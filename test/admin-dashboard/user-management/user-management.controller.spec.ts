import { Test, TestingModule } from '@nestjs/testing';
import { UserManagementController } from 'src/modules/super-admin/user-management/user-management.controller';
import { UserManagementService } from 'src/modules/super-admin/user-management/user-management.service';
import { ListUsersDto } from 'src/modules/super-admin/user-management/dto/list-users.dto';
import { SearchUsersDto } from 'src/modules/super-admin/user-management/dto/search-users.dto';
import { ListUserActivityLogsDto } from 'src/modules/super-admin/user-management/dto/list-user-activity-logs.dto';

/**
 * UserManagementController Tests
 * ------------------------------
 * Purpose:
 * - Test user management endpoints: list, search, detail, activity logs, enums.
 *
 * Test Coverage:
 * - GET /admin/users/list endpoint
 * - GET /admin/users/search endpoint
 * - GET /admin/users/:id endpoint
 * - GET /admin/users/activity-logs endpoint
 * - GET /admin/users/enums endpoint
 * - Proper parameter passing to service
 * - Response shape validation
 */
describe('UserManagementController', () => {
  let controller: UserManagementController;
  let service: UserManagementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserManagementController],
      providers: [
        {
          provide: UserManagementService,
          useValue: {
            listUsers: jest.fn(),
            searchUsers: jest.fn(),
            getUserDetail: jest.fn(),
            listUserActivityLogs: jest.fn(),
            getUserManagementEnums: jest.fn(),
            setUserActiveStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UserManagementController>(UserManagementController);
    service = module.get<UserManagementService>(UserManagementService);
  });

  describe('listUsers', () => {
    it('should call service.listUsers with query', async () => {
      const query: ListUsersDto = {
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'DESC',
      };

      const expectedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(expectedResult);

      const result = await controller.listUsers(query);

      expect(service.listUsers).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty result list', async () => {
      const query: ListUsersDto = { page: 1, limit: 20 };

      const expectedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(expectedResult);

      const result = await controller.listUsers(query);

      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should pass all filter parameters to service', async () => {
      const query: ListUsersDto = {
        page: 2,
        limit: 50,
        sort: 'first_name',
        order: 'ASC',
        search: 'john',
        onboarding_status: 'completed',
        account_status: 'active',
        gender: 'male',
      };

      jest
        .spyOn(service, 'listUsers')
        .mockResolvedValue({ data: [], total: 0, page: 2, limit: 50, totalPages: 0 });

      await controller.listUsers(query);

      expect(service.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 50,
          sort: 'first_name',
          order: 'ASC',
          search: 'john',
          onboarding_status: 'completed',
          account_status: 'active',
          gender: 'male',
        }),
      );
    });
  });

  describe('searchUsers', () => {
    it('should call service.searchUsers with query', async () => {
      const query: SearchUsersDto = { query: 'john' };

      const expectedResult = {
        data: [
          {
            id: 'user-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
            gender: 'Male',
            age: 34,
          },
        ],
        total: 1,
      };

      jest.spyOn(service, 'searchUsers').mockResolvedValue(expectedResult);

      const result = await controller.searchUsers(query);

      expect(service.searchUsers).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty search results', async () => {
      const query: SearchUsersDto = { query: 'nonexistent' };

      const expectedResult = {
        data: [],
        total: 0,
      };

      jest.spyOn(service, 'searchUsers').mockResolvedValue(expectedResult);

      const result = await controller.searchUsers(query);

      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should pass search query and limit to service', async () => {
      const query: SearchUsersDto = { query: 'test', limit: 10 };

      jest.spyOn(service, 'searchUsers').mockResolvedValue({ data: [], total: 0 });

      await controller.searchUsers(query);

      expect(service.searchUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          limit: 10,
        }),
      );
    });

    it('should return only 6 fields per user', async () => {
      const query: SearchUsersDto = { query: 'john' };

      const expectedResult = {
        data: [
          {
            id: 'user-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
            gender: 'Male',
            age: 34,
          },
        ],
        total: 1,
      };

      jest.spyOn(service, 'searchUsers').mockResolvedValue(expectedResult);

      const result = await controller.searchUsers(query);

      const userKeys = Object.keys(result.data[0]);
      expect(userKeys.length).toBe(6);
    });
  });

  describe('getUserDetail', () => {
    it('should call service.getUserDetail with id', async () => {
      const userId = 'user-1';

      const expectedResult = {
        user: {
          id: userId,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@test.com',
          gender: 'Male',
          age: 34,
          date_of_birth: new Date('1990-01-01'),
          bio: 'Test bio',
          objective: 'Test objective',
          avatar: null,
          linkedin_profile: null,
          onboarding_status: 'Completed',
          is_active: true,
          account_status: 'Active',
          is_email_verified: true,
          email_notifications: true,
          allow_matching: true,
          timezone: null,
          last_login_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        documents: [],
        summary: null,
        activity_logs: [],
      };

      jest.spyOn(service, 'getUserDetail').mockResolvedValue(expectedResult);

      const result = await controller.getUserDetail({ id: userId });

      expect(service.getUserDetail).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expectedResult);
    });

    it('should return complete user detail structure', async () => {
      const userId = 'user-1';

      const expectedResult = {
        user: expect.any(Object),
        documents: expect.any(Array),
        summary: null,
        activity_logs: expect.any(Array),
      };

      jest.spyOn(service, 'getUserDetail').mockResolvedValue(expectedResult);

      const result = await controller.getUserDetail({ id: userId });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('documents');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('activity_logs');
    });

    it('should handle user with documents', async () => {
      const userId = 'user-1';

      const expectedResult = {
        user: { id: userId } as unknown as any,
        documents: [
          {
            id: 'doc-1',
            user_id: userId,
            document_url: 'https://example.com/doc.pdf',
            document_type: 'resume',
            parsed_metadata: { pages: 1 },
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        summary: null,
        activity_logs: [],
      };

      jest.spyOn(service, 'getUserDetail').mockResolvedValue(expectedResult);

      const result = await controller.getUserDetail({ id: userId });

      expect(result.documents.length).toBe(1);
      expect(result.documents[0]).toHaveProperty('document_url');
    });

    it('should handle user with summary', async () => {
      const userId = 'user-1';

      const expectedResult = {
        user: { id: userId } as unknown as any,
        documents: [],
        summary: {
          id: 'summary-1',
          user_id: userId,
          summary_text: 'Test summary',
          status: 'approved',
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        activity_logs: [],
      };

      jest.spyOn(service, 'getUserDetail').mockResolvedValue(expectedResult);

      const result = await controller.getUserDetail({ id: userId });

      expect(result.summary).not.toBeNull();
      expect(result.summary?.summary_text).toBe('Test summary');
    });

    it('should handle user with activity logs', async () => {
      const userId = 'user-1';

      const expectedResult = {
        user: { id: userId } as unknown as any,
        documents: [],
        summary: null,
        activity_logs: [
          {
            id: 'log-1',
            user_id: userId,
            event_type: 'Signed In',
            event_time: new Date(),
            metadata: {},
            created_at: new Date(),
          },
        ],
      };

      jest.spyOn(service, 'getUserDetail').mockResolvedValue(expectedResult);

      const result = await controller.getUserDetail({ id: userId });

      expect(result.activity_logs.length).toBe(1);
      expect(result.activity_logs[0].event_type).toBe('Signed In');
    });

    it('should handle service errors gracefully', async () => {
      const userId = 'nonexistent';

      jest.spyOn(service, 'getUserDetail').mockRejectedValue(new Error('User not found'));

      await expect(controller.getUserDetail({ id: userId })).rejects.toThrow();
    });
  });

  describe('listUserActivityLogs', () => {
    it('should call service.listUserActivityLogs with query', async () => {
      const query: ListUserActivityLogsDto = { page: 1, limit: 20 };

      const expectedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };

      jest.spyOn(service, 'listUserActivityLogs').mockResolvedValue(expectedResult);

      const result = await controller.listUserActivityLogs(query);

      expect(service.listUserActivityLogs).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty activity logs result', async () => {
      const query: ListUserActivityLogsDto = { page: 1, limit: 20 };

      const expectedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };

      jest.spyOn(service, 'listUserActivityLogs').mockResolvedValue(expectedResult);

      const result = await controller.listUserActivityLogs(query);

      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should pass pagination parameters to service', async () => {
      const query: ListUserActivityLogsDto = { page: 2, limit: 50 };

      jest
        .spyOn(service, 'listUserActivityLogs')
        .mockResolvedValue({ data: [], total: 0, page: 2, limit: 50, totalPages: 0 });

      await controller.listUserActivityLogs(query);

      expect(service.listUserActivityLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 50,
        }),
      );
    });

    it('should pass user_id filter to service when provided', async () => {
      const query: ListUserActivityLogsDto = { page: 1, limit: 20, user_id: 'user-1' };

      jest
        .spyOn(service, 'listUserActivityLogs')
        .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await controller.listUserActivityLogs(query);

      expect(service.listUserActivityLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
        }),
      );
    });

    it('should return paginated activity logs response', async () => {
      const query: ListUserActivityLogsDto = { page: 1, limit: 20 };

      const expectedResult = {
        data: [
          {
            id: 'log-1',
            user_id: 'user-1',
            user: {
              id: 'user-1',
              full_name: 'John Doe',
              email: 'john@test.com',
            },
            event_type: 'login',
            event_time: new Date(),
            metadata: { ip: '192.168.1.1' },
            created_at: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      jest.spyOn(service, 'listUserActivityLogs').mockResolvedValue(expectedResult);

      const result = await controller.listUserActivityLogs(query);

      expect(result.data.length).toBe(1);
      expect(result.data[0]).toHaveProperty('user');
      expect(result.data[0].user?.full_name).toBe('John Doe');
    });

    it('should include pagination metadata in response', async () => {
      const query: ListUserActivityLogsDto = { page: 2, limit: 50 };

      const expectedResult = {
        data: [],
        total: 100,
        page: 2,
        limit: 50,
        totalPages: 2,
      };

      jest.spyOn(service, 'listUserActivityLogs').mockResolvedValue(expectedResult);

      const result = await controller.listUserActivityLogs(query);

      expect(result).toHaveProperty('page', 2);
      expect(result).toHaveProperty('limit', 50);
      expect(result).toHaveProperty('total', 100);
      expect(result).toHaveProperty('totalPages', 2);
    });
  });

  describe('getUserManagementEnums', () => {
    it('should call service.getUserManagementEnums', async () => {
      const expectedResult = {
        sort_fields: [{ label: 'Created At', value: 'created_at' }],
        sort_orders: [
          { label: 'ASC', value: 'ASC' },
          { label: 'DESC', value: 'DESC' },
        ],
        account_statuses: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
        ],
        onboarding_statuses: [
          { label: 'Not Started', value: 'not_started' },
          { label: 'In Progress', value: 'in_progress' },
          { label: 'Completed', value: 'completed' },
        ],
        genders: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
          { label: 'Other', value: 'other' },
        ],
      };

      jest.spyOn(service, 'getUserManagementEnums').mockReturnValue(expectedResult);

      const result = await controller.getUserManagementEnums();

      expect(service.getUserManagementEnums).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should return all enum categories', async () => {
      const expectedResult = {
        sort_fields: [],
        sort_orders: [],
        account_statuses: [],
        onboarding_statuses: [],
        genders: [],
      };

      jest.spyOn(service, 'getUserManagementEnums').mockReturnValue(expectedResult);

      const result = await controller.getUserManagementEnums();

      expect(result).toHaveProperty('sort_fields');
      expect(result).toHaveProperty('sort_orders');
      expect(result).toHaveProperty('account_statuses');
      expect(result).toHaveProperty('onboarding_statuses');
      expect(result).toHaveProperty('genders');
    });

    it('should return enums in label/value format', async () => {
      const expectedResult = {
        sort_fields: [
          { label: 'Created At', value: 'created_at' },
          { label: 'First Name', value: 'first_name' },
        ],
        sort_orders: [
          { label: 'ASC', value: 'ASC' },
          { label: 'DESC', value: 'DESC' },
        ],
        account_statuses: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
        ],
        onboarding_statuses: [
          { label: 'Not Started', value: 'not_started' },
          { label: 'In Progress', value: 'in_progress' },
          { label: 'Completed', value: 'completed' },
        ],
        genders: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
          { label: 'Other', value: 'other' },
        ],
      };

      jest.spyOn(service, 'getUserManagementEnums').mockReturnValue(expectedResult);

      const result = await controller.getUserManagementEnums();

      // Verify structure for each enum category
      result.sort_fields.forEach((field: any) => {
        expect(field).toHaveProperty('label');
        expect(field).toHaveProperty('value');
      });

      result.sort_orders.forEach((order: any) => {
        expect(order).toHaveProperty('label');
        expect(order).toHaveProperty('value');
      });

      result.account_statuses.forEach((status: any) => {
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('value');
      });

      result.onboarding_statuses.forEach((status: any) => {
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('value');
      });

      result.genders.forEach((gender: any) => {
        expect(gender).toHaveProperty('label');
        expect(gender).toHaveProperty('value');
      });
    });

    it('should return properly capitalized labels', async () => {
      const expectedResult = {
        sort_fields: [{ label: 'Created At', value: 'created_at' }],
        sort_orders: [
          { label: 'ASC', value: 'ASC' },
          { label: 'DESC', value: 'DESC' },
        ],
        account_statuses: [{ label: 'Active', value: 'active' }],
        onboarding_statuses: [{ label: 'Not Started', value: 'not_started' }],
        genders: [{ label: 'Male', value: 'male' }],
      };

      jest.spyOn(service, 'getUserManagementEnums').mockReturnValue(expectedResult);

      const result = await controller.getUserManagementEnums();

      expect(result.sort_fields[0].label).toBe('Created At');
      expect(result.account_statuses[0].label).toBe('Active');
      expect(result.onboarding_statuses[0].label).toBe('Not Started');
    });
  });

  describe('setUserActivation', () => {
    it('should call service.setUserActiveStatus with body and return result', async () => {
      const body = { user_id: 'user-1', is_active: true };

      const expectedResult = {
        user: {
          id: 'user-1',
          full_name: 'John Doe',
          is_active: true,
        },
      };

      jest.spyOn(service, 'setUserActiveStatus').mockResolvedValue(expectedResult as any);

      const result = await controller.setUserActivation(body as any);

      expect(service.setUserActiveStatus).toHaveBeenCalledWith(body);
      expect(result).toEqual(expectedResult);
    });

    it('should propagate errors from service (e.g., NotFound)', async () => {
      const body = { user_id: 'nonexistent', is_active: false };

      jest.spyOn(service, 'setUserActiveStatus').mockRejectedValue(new Error('User not found'));

      await expect(controller.setUserActivation(body as any)).rejects.toThrow('User not found');
    });
  });
});
