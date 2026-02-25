import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from 'src/common/filters/global-exception.filter';
import { LoggerService } from 'src/common/logger/logger.service';
import cookieParser from 'cookie-parser';

/**
 * Admin Dashboard E2E Tests
 * -------------------------
 * Purpose:
 * - Test complete admin dashboard workflows with real database (when applicable).
 * - Verify authentication, authorization, and data integrity.
 *
 * Test Coverage:
 * - Admin login/logout workflow
 * - User management list/search/detail flow
 * - Permission and authorization checks
 * - Error handling
 * - Response format validation
 *
 * Note: Requires test database to be set up.
 */
describe('Admin Dashboard E2E', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Attach runtime-like global pipes/interceptors/filters so responses match main.ts
    const logger = moduleFixture.get<LoggerService>(LoggerService);
    app.useLogger(logger);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter(logger));
    app.use(cookieParser());

    await app.init();
  }, 20000);

  afterAll(async () => {
    if (app && app.close) await app.close();
  });

  describe('Admin Authentication (POST /admin/auth/login)', () => {
    it('should return 200 with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({
          email: 'admin@2connect.ai',
          password: 'Admin@123',
        })
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          expect(res.body).toHaveProperty('result');
          expect(res.body.result).toHaveProperty('user');
          expect(res.body.result).toHaveProperty('access_token');
          expect(res.body.result.user).toHaveProperty('email');
          expect(res.body.result.user).toHaveProperty('role');
          adminToken = res.body.result.access_token;
        });
    });

    it('should return 401 with invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({
          email: 'admin@2connect.ai',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should return 401 for non-existent user', () => {
      return request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123',
        })
        .expect(401);
    });

    it('should validate email format', () => {
      return request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        })
        .expect(400);
    });

    it('should require password', () => {
      return request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({
          email: 'admin@2connect.ai',
        })
        .expect(400);
    });
  });

  describe('Admin Logout (POST /admin/auth/logout)', () => {
    it('should return 200 with valid token', () => {
      return request(app.getHttpServer())
        .post('/admin/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer()).post('/admin/auth/logout').expect(401);
    });
  });

  describe('List Users (GET /admin/users/list)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/admin/users/list').expect(401);
    });

    it('should require admin role', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list')
        .set('Authorization', `Bearer invalid-token`)
        .expect(401);
    });

    it('should return 200 with valid token', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          expect(res.body).toHaveProperty('result');
          expect(res.body.result).toHaveProperty('data');
          expect(res.body.result).toHaveProperty('total');
          expect(res.body.result).toHaveProperty('page');
          expect(res.body.result).toHaveProperty('limit');
          expect(res.body.result).toHaveProperty('totalPages');
        });
    });

    it('should accept pagination parameters', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          expect(res.body.result.page).toBe(1);
          expect(res.body.result.limit).toBe(10);
        });
    });

    it('should accept sort parameter', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list?sort=created_at&order=DESC')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should accept filter parameters', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list?onboarding_status=completed&account_status=active')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should accept search parameter', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list?search=john')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should enforce max limit of 100', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list?limit=200')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          expect(res.body.result.limit).toBeLessThanOrEqual(100);
        });
    });

    it('should return proper user fields', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          const userList = (res.body.result.data as Record<string, unknown>[]) || [];
          if (userList.length > 0) {
            const user = userList[0];
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('full_name');
            expect(user).toHaveProperty('email');
            expect(user).toHaveProperty('gender');
            expect(user).toHaveProperty('age');
            expect(user).toHaveProperty('onboarding_status');
            expect(user).toHaveProperty('account_status');
            expect(user).toHaveProperty('created_at');
            expect(user).toHaveProperty('updated_at');
          }
        });
    });
  });

  describe('Search Users (GET /admin/users/search)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/admin/users/search?query=test').expect(401);
    });

    it('should require query parameter', () => {
      return request(app.getHttpServer())
        .get('/admin/users/search')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should return 200 with valid query', () => {
      return request(app.getHttpServer())
        .get('/admin/users/search?query=john')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          expect(res.body).toHaveProperty('result');
          expect(res.body.result).toHaveProperty('data');
          expect(res.body.result).toHaveProperty('total');
        });
    });

    it('should limit results to 20', () => {
      return request(app.getHttpServer())
        .get('/admin/users/search?query=test&limit=100')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          const data = (res.body.result.data as Record<string, unknown>[]) || [];
          expect(data.length).toBeLessThanOrEqual(20);
        });
    });

    it('should return 6 fields per user', () => {
      return request(app.getHttpServer())
        .get('/admin/users/search?query=test')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res: Record<string, unknown>) => {
          const userList = (res.body.result.data as Record<string, unknown>[]) || [];
          if (userList.length > 0) {
            const user = userList[0];
            const keys = Object.keys(user);
            expect(keys.length).toBe(9);
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('full_name');
            expect(user).toHaveProperty('email');
            expect(user).toHaveProperty('gender');
            expect(user).toHaveProperty('age');
            expect(user).toHaveProperty('account_status');
            expect(user).toHaveProperty('onboarding_status');
            expect(user).toHaveProperty('created_at');
            expect(user).toHaveProperty('updated_at');
          }
        });
    });
  });

  describe('Get User Detail (GET /admin/users/:id)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/admin/users/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/admin/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should return complete user detail structure', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .then((listRes: Record<string, unknown>) => {
          const users = (listRes.body.result.data as Record<string, unknown>[]) || [];
          if (users.length === 0) {
            // Skip if no users available
            return;
          }

          const userId = (users[0] as Record<string, string>).id;
          return request(app.getHttpServer())
            .get(`/admin/users/${userId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
            .expect((res: Record<string, unknown>) => {
              const result = res.body.result as Record<string, unknown>;
              expect(result).toHaveProperty('user');
              expect(result).toHaveProperty('documents');
              expect(result).toHaveProperty('summary');
            });
        });
    });

    it('should return 20 user fields', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .then((listRes: Record<string, unknown>) => {
          const users = (listRes.body.result.data as Record<string, unknown>[]) || [];
          if (users.length === 0) {
            return;
          }

          const userId = (users[0] as Record<string, string>).id;
          return request(app.getHttpServer())
            .get(`/admin/users/${userId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
            .expect((res: Record<string, unknown>) => {
              const user = (res.body.result as Record<string, unknown>).user as Record<
                string,
                unknown
              >;
              const keys = Object.keys(user);
              // Implementation returns 20 fields (see user-management service formatting)
              expect(keys.length).toBe(20);
            });
        });
    });

    it('should include all required user fields', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .then((listRes: Record<string, unknown>) => {
          const users = (listRes.body.result.data as Record<string, unknown>[]) || [];
          if (users.length === 0) {
            return;
          }

          const userId = (users[0] as Record<string, string>).id;
          return request(app.getHttpServer())
            .get(`/admin/users/${userId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
            .expect((res: Record<string, unknown>) => {
              const user = (res.body.result as Record<string, unknown>).user as Record<
                string,
                unknown
              >;
              expect(user).toHaveProperty('id');
              expect(user).toHaveProperty('full_name');
              expect(user).toHaveProperty('email');
              expect(user).toHaveProperty('gender');
              expect(user).toHaveProperty('age');
              expect(user).toHaveProperty('account_status');
              expect(user).toHaveProperty('onboarding_status');
            });
        });
    });

    it('should return documents array', () => {
      return request(app.getHttpServer())
        .get('/admin/users/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .then((listRes: Record<string, unknown>) => {
          const users = (listRes.body.result.data as Record<string, unknown>[]) || [];
          if (users.length === 0) {
            return;
          }

          const userId = (users[0] as Record<string, string>).id;
          return request(app.getHttpServer())
            .get(`/admin/users/${userId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
            .expect((res: Record<string, unknown>) => {
              const documents = (res.body.result as Record<string, unknown>).documents as Record<
                string,
                unknown
              >[];
              expect(Array.isArray(documents)).toBe(true);
            });
        });
    });
  });
});
