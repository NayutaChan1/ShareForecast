import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { Quote } from '../market/market.types';

/** Room name for per-symbol fan-out. */
const room = (symbol: string): string => `symbol:${symbol.toUpperCase()}`;

// Decorator options are evaluated at class-definition time, before the config
// module exists, so the origin allowlist cannot be read from ConfigService
// here. Restricting it needs a custom IoAdapter — see the roadmap.
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  private server: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { symbol?: string },
  ): { subscribed: string | null } {
    if (!payload?.symbol) return { subscribed: null };
    void client.join(room(payload.symbol));
    return { subscribed: payload.symbol.toUpperCase() };
  }

  @SubscribeMessage('unsubscribe')
  unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { symbol?: string },
  ): { unsubscribed: string | null } {
    if (!payload?.symbol) return { unsubscribed: null };
    void client.leave(room(payload.symbol));
    return { unsubscribed: payload.symbol.toUpperCase() };
  }

  /** Push a quote to everyone watching that symbol, plus the global ticker. */
  emitQuote(quote: Quote): void {
    if (!this.server) return;
    this.server.to(room(quote.symbol)).emit('quote', quote);
    this.server.emit('ticker', quote);
  }

  /**
   * Push a freshly scored article.
   *
   * Untagged articles still go out on the global channel — the news feed shows
   * everything, only the per-symbol overlay is filtered.
   */
  emitSentiment(payload: { symbols?: string[] } & Record<string, unknown>): void {
    if (!this.server) return;
    for (const symbol of payload.symbols ?? []) {
      this.server.to(room(symbol)).emit('sentiment', payload);
    }
    this.server.emit('sentiment:all', payload);
  }
}
