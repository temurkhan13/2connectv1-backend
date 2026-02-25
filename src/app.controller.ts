import { Controller, Get, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { AppService } from 'src/app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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

  // Health endpoint at /api/health (version neutral, fallback)
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
