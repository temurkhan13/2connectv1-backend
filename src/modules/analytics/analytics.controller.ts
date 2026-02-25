import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';
import {
  TrackEventDto,
  FunnelQueryDto,
  FunnelReportDto,
  UserEngagementDto,
} from './dto/analytics.dto';

/**
 * Analytics Controller
 * Phase 4.3: Success Metrics Pipeline
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track an analytics event' })
  @ApiResponse({
    status: 200,
    description: 'Event tracked successfully',
  })
  async trackEvent(
    @Request() req,
    @Body() dto: TrackEventDto,
  ): Promise<{
    code: number;
    message: string;
    result: null;
  }> {
    await this.analyticsService.trackEvent(req.user.id, dto);
    return {
      code: 200,
      message: 'Event tracked',
      result: null,
    };
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Get funnel report' })
  @ApiResponse({
    status: 200,
    description: 'Returns funnel metrics',
  })
  async getFunnelReport(
    @Query() dto: FunnelQueryDto,
  ): Promise<{
    code: number;
    message: string;
    result: FunnelReportDto;
  }> {
    const result = await this.analyticsService.getFunnelReport(dto);
    return {
      code: 200,
      message: 'Funnel report retrieved',
      result,
    };
  }

  @Get('engagement')
  @ApiOperation({ summary: 'Get my engagement score' })
  @ApiResponse({
    status: 200,
    description: 'Returns user engagement metrics',
  })
  async getMyEngagement(
    @Request() req,
  ): Promise<{
    code: number;
    message: string;
    result: UserEngagementDto | null;
  }> {
    const result = await this.analyticsService.getUserEngagement(req.user.id);
    return {
      code: 200,
      message: 'Engagement data retrieved',
      result,
    };
  }
}
