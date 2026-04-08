/**
 * EventListenerService
 * --------------------
 * Subscribes to Redis pub/sub channels for cross-service events.
 * Triggers push notifications when events are received from AI service.
 *
 * Events handled:
 * - matches_ready: User's matches have been calculated → send push notification
 * - onboarding_complete: User completed onboarding → send welcome notification
 * - match_accepted: A match was accepted → notify the other user
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import Redis from 'ioredis';

// Event channel names (must match AI service publisher)
const CHANNELS = {
  MATCHES_READY: '2connect:events:matches_ready',
  ONBOARDING_COMPLETE: '2connect:events:onboarding_complete',
  MATCH_ACCEPTED: '2connect:events:match_accepted',
};

interface MatchesReadyEvent {
  user_id: string;
  match_count: number;
  algorithm: string;
  reciprocal_updates: number;
  trigger: 'onboarding' | 'cron' | 'profile_edit';
  timestamp: string;
  source: string;
  event_type: string;
}

interface OnboardingCompleteEvent {
  user_id: string;
  session_id: string;
  slots_filled: number;
  timestamp: string;
  source: string;
  event_type: string;
}

interface MatchAcceptedEvent {
  user_a_id: string;
  user_b_id: string;
  match_id: string;
  timestamp: string;
  source: string;
  event_type: string;
}

@Injectable()
export class EventListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventListenerService.name);
  private subscriber: Redis | null = null;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Called when the module initializes.
   * Sets up Redis subscriber connection and starts listening for events.
   */
  async onModuleInit() {
    this.logger.log('[EventListener] Initializing...');
    await this.connect();
  }

  /**
   * Called when the module is destroyed (app shutdown).
   * Cleans up Redis connection.
   */
  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Connect to Redis and subscribe to event channels.
   */
  private async connect(): Promise<void> {
    try {
      // Build Redis connection URL from config
      const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
      const port = Number(this.configService.get<number>('REDIS_PORT') || 6379);
      const password = this.configService.get<string>('REDIS_PASSWORD') || '';
      const username = this.configService.get<string>('REDIS_USERNAME') || undefined;
      const useTls = String(this.configService.get('REDIS_TLS')) === 'true';

      const scheme = useTls ? 'rediss' : 'redis';
      const url = `${scheme}://${host}:${port}`;

      // Create a dedicated subscriber connection
      // (Redis pub/sub requires a separate connection from regular commands)
      this.subscriber = new Redis(url, {
        password: password || undefined,
        username,
        tls: useTls ? {} : undefined,
        retryStrategy: (times: number) => Math.min(times * 100, 2000),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      // Connect
      await this.subscriber.connect();
      this.isConnected = true;
      this.logger.log('[EventListener] Connected to Redis');

      // Subscribe to channels
      await this.subscriber.subscribe(
        CHANNELS.MATCHES_READY,
        CHANNELS.ONBOARDING_COMPLETE,
        CHANNELS.MATCH_ACCEPTED,
      );
      this.logger.log(`[EventListener] Subscribed to channels: ${Object.values(CHANNELS).join(', ')}`);

      // Handle incoming messages
      this.subscriber.on('message', async (channel: string, message: string) => {
        try {
          const data = JSON.parse(message);
          await this.handleEvent(channel, data);
        } catch (error) {
          this.logger.error(`[EventListener] Failed to parse message: ${error}`);
        }
      });

      // Handle connection errors
      this.subscriber.on('error', (error) => {
        this.logger.error(`[EventListener] Redis error: ${error.message}`);
        this.isConnected = false;
      });

      // Handle reconnection
      this.subscriber.on('reconnecting', () => {
        this.logger.warn('[EventListener] Reconnecting to Redis...');
      });

    } catch (error) {
      this.logger.error(`[EventListener] Failed to connect: ${error}`);
      this.isConnected = false;
    }
  }

  /**
   * Disconnect from Redis.
   */
  private async disconnect(): Promise<void> {
    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe();
        await this.subscriber.quit();
        this.logger.log('[EventListener] Disconnected from Redis');
      } catch (error) {
        this.logger.error(`[EventListener] Error during disconnect: ${error}`);
      }
      this.subscriber = null;
      this.isConnected = false;
    }
  }

  /**
   * Route events to appropriate handlers.
   */
  private async handleEvent(channel: string, data: any): Promise<void> {
    this.logger.log(`[EventListener] Received event on ${channel}: ${JSON.stringify(data)}`);

    switch (channel) {
      case CHANNELS.MATCHES_READY:
        await this.handleMatchesReady(data as MatchesReadyEvent);
        break;

      case CHANNELS.ONBOARDING_COMPLETE:
        await this.handleOnboardingComplete(data as OnboardingCompleteEvent);
        break;

      case CHANNELS.MATCH_ACCEPTED:
        await this.handleMatchAccepted(data as MatchAcceptedEvent);
        break;

      default:
        this.logger.warn(`[EventListener] Unknown channel: ${channel}`);
    }
  }

  /**
   * Handle matches_ready event - send push notification to user.
   */
  private async handleMatchesReady(event: MatchesReadyEvent): Promise<void> {
    const { user_id, match_count, trigger } = event;

    if (!user_id || match_count === undefined) {
      this.logger.warn('[EventListener] Invalid matches_ready event: missing user_id or match_count');
      return;
    }

    // Don't notify if no matches found
    if (match_count === 0) {
      this.logger.log(`[EventListener] No matches for ${user_id}, skipping notification`);
      return;
    }

    try {
      // Differentiated messages based on what triggered the match generation
      let title: string;
      let body: string;
      const matchText = match_count === 1 ? '1 connection' : `${match_count} connections`;

      switch (trigger) {
        case 'profile_edit':
          title = 'Matches Updated ✨';
          body = `Your matches have been refreshed based on your profile changes. ${matchText} found.`;
          break;
        case 'cron':
          title = `You have ${match_count} new matches`;
          body = `We found ${matchText} for you. Check them out!`;
          break;
        case 'onboarding':
        default:
          title = 'Your matches are ready! 🎉';
          body = `We found ${matchText} for you. Start connecting!`;
          break;
      }

      await this.notificationService.sendToUser(
        user_id,
        title,
        body,
        {
          type: 'matches_ready',
          match_count: String(match_count),
          trigger: trigger || 'onboarding',
          screen: 'matches',
        },
      );

      this.logger.log(`[EventListener] Sent matches_ready (${trigger}) notification to ${user_id}`);
    } catch (error) {
      this.logger.error(`[EventListener] Failed to send matches_ready notification: ${error}`);
    }
  }

  /**
   * Handle onboarding_complete event - send welcome notification.
   */
  private async handleOnboardingComplete(event: OnboardingCompleteEvent): Promise<void> {
    const { user_id, slots_filled } = event;

    if (!user_id) {
      this.logger.warn('[EventListener] Invalid onboarding_complete event: missing user_id');
      return;
    }

    try {
      await this.notificationService.sendToUser(
        user_id,
        'Welcome to 2Connect! 👋',
        'Your profile is ready. We\'re finding your best matches now.',
        {
          type: 'onboarding_complete',
          slots_filled: String(slots_filled || 0),
          screen: 'dashboard',
        },
      );

      this.logger.log(`[EventListener] Sent onboarding_complete notification to ${user_id}`);
    } catch (error) {
      this.logger.error(`[EventListener] Failed to send onboarding_complete notification: ${error}`);
    }
  }

  /**
   * Handle match_accepted event - notify the other user.
   */
  private async handleMatchAccepted(event: MatchAcceptedEvent): Promise<void> {
    const { user_a_id, user_b_id, match_id } = event;

    if (!user_a_id || !user_b_id) {
      this.logger.warn('[EventListener] Invalid match_accepted event: missing user IDs');
      return;
    }

    try {
      // Notify user_b that user_a accepted the match
      await this.notificationService.sendToUser(
        user_b_id,
        'New Connection! 🤝',
        'Someone accepted your connection request. Start a conversation!',
        {
          type: 'match_accepted',
          match_id: match_id || '',
          screen: 'chat',
        },
      );

      this.logger.log(`[EventListener] Sent match_accepted notification to ${user_b_id}`);
    } catch (error) {
      this.logger.error(`[EventListener] Failed to send match_accepted notification: ${error}`);
    }
  }

  /**
   * Check if the event listener is connected.
   */
  isListening(): boolean {
    return this.isConnected;
  }
}
