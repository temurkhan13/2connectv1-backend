import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeEventsService {
  constructor(private readonly gateway: RealtimeGateway) {}

  /**
   * Emit to one user (all their devices/tabs).
   */
  emitToUser(userId: string, event: string, payload: any) {
    this.gateway.server.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Emit to many users.
   */
  emitToUsers(userIds: string[], event: string, payload: any) {
    userIds.forEach(id => this.emitToUser(id, event, payload));
  }
}
