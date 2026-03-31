import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Event, EventParticipant, EventMatchBadge } from 'src/common/entities/event.entity';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';
import { NotificationService } from 'src/modules/notifications/notification.service';
import { CreateEventDto, UpdateEventDto, JoinEventDto, VALID_EVENT_GOALS, areGoalsComplementary } from './dto/events.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectModel(Event) private eventModel: typeof Event,
    @InjectModel(EventParticipant) private participantModel: typeof EventParticipant,
    @InjectModel(EventMatchBadge) private badgeModel: typeof EventMatchBadge,
    @InjectModel(Match) private matchModel: typeof Match,
    @InjectModel(User) private userModel: typeof User,
    private sequelize: Sequelize,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── Admin CRUD ─────────────────────────────────────────

  async createEvent(dto: CreateEventDto, adminId: string): Promise<Event> {
    const accessCode = this.generateAccessCode(dto.name);

    const event = await this.eventModel.create({
      ...dto,
      access_code: accessCode,
      created_by: adminId,
    });

    this.logger.log(`Event created: ${event.name} (code: ${accessCode})`);
    return event;
  }

  async updateEvent(eventId: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.eventModel.findByPk(eventId);
    if (!event) throw new NotFoundException('Event not found');

    await event.update(dto);
    this.logger.log(`Event updated: ${event.name}`);
    return event;
  }

  async listEventsAdmin(): Promise<Event[]> {
    return this.eventModel.findAll({
      order: [['event_date', 'ASC']],
      include: [{ model: EventParticipant, attributes: ['id'] }],
    });
  }

  async getEventAdmin(eventId: string): Promise<any> {
    const event = await this.eventModel.findByPk(eventId, {
      include: [{ model: EventParticipant, include: [{ model: User, attributes: ['id', 'first_name', 'last_name', 'email'] }] }],
    });
    if (!event) throw new NotFoundException('Event not found');

    // Goal breakdown
    const goalBreakdown: Record<string, number> = {};
    for (const p of event.participants || []) {
      for (const g of p.goals) {
        goalBreakdown[g] = (goalBreakdown[g] || 0) + 1;
      }
    }

    // Badge count
    const badgeCount = await this.badgeModel.count({ where: { event_id: eventId } });

    return {
      ...event.toJSON(),
      participant_count: event.participants?.length || 0,
      goal_breakdown: goalBreakdown,
      connections_made: badgeCount,
    };
  }

  // ─── User-Facing ────────────────────────────────────────

  async listUpcomingEvents(): Promise<any[]> {
    const events = await this.eventModel.findAll({
      where: {
        status: { [Op.in]: ['upcoming', 'active'] },
        event_date: { [Op.gte]: new Date() },
      },
      order: [['event_date', 'ASC']],
      attributes: ['id', 'name', 'description', 'event_date', 'event_end_date', 'venue', 'city', 'country', 'logo_url', 'status'],
    });

    // Attach participant counts
    const result: any[] = [];
    for (const event of events) {
      const count = await this.participantModel.count({ where: { event_id: event.id } });
      result.push({ ...(event.toJSON() as any), participant_count: count });
    }
    return result;
  }

  async getEventDetail(eventId: string, userId: string): Promise<any> {
    const event = await this.eventModel.findByPk(eventId, {
      attributes: ['id', 'name', 'description', 'event_date', 'event_end_date', 'venue', 'city', 'country', 'logo_url', 'status'],
    });
    if (!event) throw new NotFoundException('Event not found');

    const participantCount = await this.participantModel.count({ where: { event_id: eventId } });
    const myParticipation = await this.participantModel.findOne({
      where: { user_id: userId, event_id: eventId },
    });

    // Count my matches at this event
    let eventMatchCount = 0;
    if (myParticipation) {
      eventMatchCount = await this.badgeModel.count({
        where: { event_id: eventId },
        include: [{
          model: Event,
          required: false,
        }],
      });
      // More accurate: count badges where the match involves this user
      const [rows] = await this.sequelize.query(`
        SELECT COUNT(*) as cnt FROM event_match_badges emb
        JOIN matches m ON m.id = emb.match_id
        WHERE emb.event_id = :eventId
        AND (m.user_a_id = :userId OR m.user_b_id = :userId)
      `, { replacements: { eventId, userId } });
      eventMatchCount = parseInt((rows as any[])[0]?.cnt || '0', 10);
    }

    return {
      ...event.toJSON(),
      participant_count: participantCount,
      joined: !!myParticipation,
      my_goals: myParticipation?.goals || null,
      my_event_matches: eventMatchCount,
    };
  }

  async joinEvent(eventId: string, userId: string, dto: JoinEventDto): Promise<any> {
    // Validate event exists
    const event = await this.eventModel.findByPk(eventId);
    if (!event) throw new NotFoundException('Event not found');

    // Validate access code
    // Note: with underscored:true, DB column access_code maps to JS accessCode
    const eventCode = (event as any).access_code || (event as any).accessCode || '';
    if (eventCode.toLowerCase() !== dto.code.toLowerCase()) {
      throw new BadRequestException('Invalid event access code');
    }

    // Validate event is joinable
    if (event.status === 'ended' || event.status === 'cancelled') {
      throw new BadRequestException('This event is no longer accepting participants');
    }

    // Validate goals
    for (const goal of dto.goals) {
      if (!VALID_EVENT_GOALS.includes(goal as any)) {
        throw new BadRequestException(`Invalid goal: ${goal}. Valid goals: ${VALID_EVENT_GOALS.join(', ')}`);
      }
    }
    if (dto.goals.length === 0 || dto.goals.length > 2) {
      throw new BadRequestException('Select 1 or 2 goals');
    }

    // Check max participants
    const currentCount = await this.participantModel.count({ where: { event_id: eventId } });
    const maxParticipants = (event as any).max_participants || (event as any).maxParticipants || 500;
    if (currentCount >= maxParticipants) {
      throw new BadRequestException('This event has reached maximum capacity');
    }

    // Check user hasn't already joined
    const existing = await this.participantModel.findOne({
      where: { user_id: userId, event_id: eventId },
    });
    if (existing) {
      throw new BadRequestException('You have already joined this event');
    }

    // Check user doesn't have more than 3 active events
    const activeEventCount = await this.participantModel.count({
      where: { user_id: userId },
      include: [{
        model: Event,
        where: { status: { [Op.in]: ['upcoming', 'active'] } },
      }],
    });
    if (activeEventCount >= 3) {
      throw new BadRequestException('You can join a maximum of 3 active events');
    }

    // Create participation
    const participant = await this.participantModel.create({
      user_id: userId,
      event_id: eventId,
      goals: dto.goals,
    });

    // Generate badges for existing matches who are also at this event
    const badgeCount = await this.generateBadges(eventId, userId, dto.goals);

    this.logger.log(`User ${userId} joined event ${event.name} with goals: ${dto.goals.join(', ')}. ${badgeCount} badges created.`);

    // Send push notification
    this.notificationService.sendToUser(
      userId,
      `Joined ${event.name}`,
      badgeCount > 0
        ? `You have ${badgeCount} connection${badgeCount > 1 ? 's' : ''} at this event!`
        : 'We\'ll notify you when connections are found.',
      { type: 'event_joined', event_id: eventId, screen: 'event_detail' },
    ).catch(err => this.logger.error(`Failed to send event join push: ${err}`));

    return {
      participant,
      badges_created: badgeCount,
      message: badgeCount > 0
        ? `You have ${badgeCount} connections at ${event.name}!`
        : `You've joined ${event.name}. We'll match you with other attendees.`,
    };
  }

  async leaveEvent(eventId: string, userId: string): Promise<void> {
    const deleted = await this.participantModel.destroy({
      where: { user_id: userId, event_id: eventId },
    });
    if (!deleted) throw new NotFoundException('You are not a participant of this event');

    // Remove badges for this user's matches at this event
    await this.sequelize.query(`
      DELETE FROM event_match_badges WHERE event_id = :eventId AND match_id IN (
        SELECT id FROM matches WHERE user_a_id = :userId OR user_b_id = :userId
      )
    `, { replacements: { eventId, userId } });

    this.logger.log(`User ${userId} left event ${eventId}`);
  }

  async getEventMatches(eventId: string, userId: string): Promise<any[]> {
    // Get matches that have badges for this event involving this user
    const [rows] = await this.sequelize.query(`
      SELECT
        m.id as match_id, m.score, m.status, m.match_reason,
        emb.goal_complementary,
        e.name as event_name,
        CASE WHEN m.user_a_id = :userId THEN m.user_b_id ELSE m.user_a_id END as other_user_id,
        CASE WHEN m.user_a_id = :userId THEN ub.first_name ELSE ua.first_name END as other_first_name,
        CASE WHEN m.user_a_id = :userId THEN ub.last_name ELSE ua.last_name END as other_last_name,
        CASE WHEN m.user_a_id = :userId THEN ub.profile_photo ELSE ua.profile_photo END as other_photo,
        CASE WHEN m.user_a_id = :userId THEN ub.objective ELSE ua.objective END as other_objective,
        ep_other.goals as other_goals
      FROM event_match_badges emb
      JOIN matches m ON m.id = emb.match_id
      JOIN events e ON e.id = emb.event_id
      JOIN users ua ON ua.id = m.user_a_id
      JOIN users ub ON ub.id = m.user_b_id
      LEFT JOIN event_participants ep_other ON ep_other.event_id = emb.event_id
        AND ep_other.user_id = CASE WHEN m.user_a_id = :userId THEN m.user_b_id ELSE m.user_a_id END
      WHERE emb.event_id = :eventId
        AND (m.user_a_id = :userId OR m.user_b_id = :userId)
      ORDER BY emb.goal_complementary DESC, m.score DESC
    `, { replacements: { eventId, userId } });

    return rows as any[];
  }

  async getUserEventBadges(userId: string): Promise<any[]> {
    // Get all event badges for this user's matches (for badges on match cards)
    const [rows] = await this.sequelize.query(`
      SELECT emb.match_id, e.id as event_id, e.name as event_name, emb.goal_complementary
      FROM event_match_badges emb
      JOIN events e ON e.id = emb.event_id
      JOIN matches m ON m.id = emb.match_id
      WHERE (m.user_a_id = :userId OR m.user_b_id = :userId)
        AND e.status IN ('upcoming', 'active')
      ORDER BY e.event_date ASC
    `, { replacements: { userId } });

    return rows as any[];
  }

  // ─── Badge Generation ───────────────────────────────────

  private async generateBadges(eventId: string, userId: string, userGoals: string[]): Promise<number> {
    // Find all other participants at this event
    const otherParticipants = await this.participantModel.findAll({
      where: { event_id: eventId, user_id: { [Op.ne]: userId } },
    });

    if (otherParticipants.length === 0) return 0;

    const otherUserIds = otherParticipants.map(p => p.user_id);

    // Find existing platform matches between this user and other participants
    const matches = await this.matchModel.findAll({
      where: {
        [Op.or]: [
          { user_a_id: userId, user_b_id: { [Op.in]: otherUserIds } },
          { user_b_id: userId, user_a_id: { [Op.in]: otherUserIds } },
        ],
      },
    });

    let badgeCount = 0;
    for (const match of matches) {
      const otherId = match.user_a_id === userId ? match.user_b_id : match.user_a_id;
      const otherParticipant = otherParticipants.find(p => p.user_id === otherId);
      if (!otherParticipant) continue;

      const complementary = areGoalsComplementary(userGoals, otherParticipant.goals);

      // Create badge (ignore if already exists)
      try {
        await this.badgeModel.create({
          event_id: eventId,
          match_id: match.id,
          goal_complementary: complementary,
        });
        badgeCount++;
      } catch (err) {
        // Unique constraint violation — badge already exists
        if (err.name !== 'SequelizeUniqueConstraintError') throw err;
      }
    }

    return badgeCount;
  }

  // ─── Report ─────────────────────────────────────────────

  async getEventReport(eventId: string): Promise<any> {
    const event = await this.eventModel.findByPk(eventId);
    if (!event) throw new NotFoundException('Event not found');

    const participants = await this.participantModel.findAll({
      where: { event_id: eventId },
      include: [{ model: User, attributes: ['id', 'first_name', 'last_name'] }],
    });

    // Goal breakdown
    const goalBreakdown: Record<string, number> = {};
    for (const p of participants) {
      for (const g of p.goals) {
        goalBreakdown[g] = (goalBreakdown[g] || 0) + 1;
      }
    }

    // Connections made (badge count)
    const totalBadges = await this.badgeModel.count({ where: { event_id: eventId } });
    const complementaryBadges = await this.badgeModel.count({
      where: { event_id: eventId, goal_complementary: true },
    });

    return {
      event_name: event.name,
      event_date: event.event_date,
      venue: event.venue,
      city: event.city,
      country: event.country,
      total_participants: participants.length,
      connections_made: totalBadges,
      complementary_connections: complementaryBadges,
      goal_breakdown: goalBreakdown,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Helpers ────────────────────────────────────────────

  private generateAccessCode(eventName: string): string {
    // Take initials + random 4 digits
    const initials = eventName
      .split(/\s+/)
      .map(w => w[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 3);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${initials}${rand}`;
  }
}
