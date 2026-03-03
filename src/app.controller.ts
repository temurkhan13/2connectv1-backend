import { Controller, Get, VERSION_NEUTRAL, Version } from '@nestjs/common';

// Main controller with versioned health endpoint
@Controller()
export class AppController {
  // Health endpoint at /api/v1/health (for Render health checks)
  @Get('health')
  @Version('1')
  healthV1() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: '2connect-backend',
    };
  }

  // Health endpoint at /api/health (version neutral)
  @Get('health')
  @Version(VERSION_NEUTRAL)
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: '2connect-backend',
    };
  }
}

// Standalone health controller at /health (no prefix, for fallback)
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: '2connect-backend',
    };
  }
}
