import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto, JoinEventDto } from './dto/events.dto';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ─── User-Facing Endpoints ──────────────────────────────

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List upcoming/active events' })
  async listEvents() {
    return this.eventsService.listUpcomingEvents();
  }

  @Get('badges/mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all event badges for my matches (for match card display)' })
  async getMyBadges(@Request() req: any) {
    return this.eventsService.getUserEventBadges(req.user.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get event details (with join status)' })
  async getEvent(@Param('id') id: string, @Request() req: any) {
    return this.eventsService.getEventDetail(id, req.user.id);
  }

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join an event with access code and goals' })
  async joinEvent(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: JoinEventDto,
  ) {
    return this.eventsService.joinEvent(id, req.user.id, dto);
  }

  @Delete(':id/leave')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave an event' })
  async leaveEvent(@Param('id') id: string, @Request() req: any) {
    await this.eventsService.leaveEvent(id, req.user.id);
    return { message: 'Left event successfully' };
  }

  @Get(':id/matches')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my matches at a specific event' })
  async getEventMatches(@Param('id') id: string, @Request() req: any) {
    return this.eventsService.getEventMatches(id, req.user.id);
  }

  // ─── Admin Endpoints ────────────────────────────────────

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Create a new event' })
  async createEvent(@Body() dto: CreateEventDto, @Request() req: any) {
    return this.eventsService.createEvent(dto, req.user.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Update event details' })
  async updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.updateEvent(id, dto);
  }

  @Get(':id/admin')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Get full event details with participants' })
  async getEventAdmin(@Param('id') id: string) {
    return this.eventsService.getEventAdmin(id);
  }

  @Get(':id/report')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Get event networking report' })
  async getEventReport(@Param('id') id: string) {
    return this.eventsService.getEventReport(id);
  }
}
