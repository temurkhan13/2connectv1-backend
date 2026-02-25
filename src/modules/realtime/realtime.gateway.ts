import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

type JwtPayload = {
  sub?: string; // common
  userId?: string; // sometimes
  email?: string;
};

@WebSocketGateway({
  namespace: '/ws',
  // cors: {
  //   origin: ['http://localhost:3000', 'https://dev.2connect.ai', 'https://uat.2connect.ai'], // adjust
  //   credentials: true,
  // },
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly config: ConfigService) {}

  /**
   * Called when a client connects.
   * We verify JWT and then join a room "user:<userId>".
   */
  async handleConnection(client: Socket) {
    try {
      const tokenFromAuth = client.handshake.auth?.token as string | undefined;
      const tokenFromQuery = client.handshake.query?.token as string | undefined;

      const token = tokenFromAuth || tokenFromQuery;
      // Option B (if you use cookies): read from client.handshake.headers.cookie
      // (skip here for simplicity)
      if (!token) {
        client.disconnect(true);
        return;
      }

      const jwtSecret: any = this.config.get<string>('JWT_SECRET');
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
      const userId = decoded.sub || decoded.userId;
      if (!userId) {
        client.disconnect(true);
        return;
      }

      // Attach for later use (optional)
      client.data.userId = userId;

      // Join user room (this is the key part)
      await client.join(`user:${userId}`);

      // Optional: confirm
      client.emit('connected', { userId });
    } catch (e) {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    // Nothing required; Socket.IO leaves rooms automatically on disconnect.
  }
}
