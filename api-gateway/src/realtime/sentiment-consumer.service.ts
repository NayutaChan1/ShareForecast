import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';

import { EventsGateway } from './events.gateway';

const EXCHANGE = 'market.sentiment';
const QUEUE = 'sentiment.results';
const ROUTING_KEY = 'sentiment.results';
const RECONNECT_DELAY_MS = 5_000;

// amqplib renamed its connection type across minor versions; deriving it from
// connect() keeps this compiling either way.
type AmqpConnection = Awaited<ReturnType<typeof connect>>;
type AmqpChannel = Awaited<ReturnType<AmqpConnection['createChannel']>>;

/**
 * Bridges RabbitMQ to the browser.
 *
 * The Python worker publishes each scored article on `sentiment.results`; this
 * consumer forwards it straight out over WebSocket.
 */
@Injectable()
export class SentimentConsumerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SentimentConsumerService.name);
  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: EventsGateway,
  ) {}

  onModuleInit(): void {
    // Not awaited: the broker may still be booting, and the HTTP API should
    // come up regardless of whether the stream is live yet.
    void this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, RECONNECT_DELAY_MS);
  }

  private async start(): Promise<void> {
    if (this.stopping) return;

    try {
      const url = this.config.get<{ url: string }>('rabbitmq')!.url;
      this.connection = await connect(url);

      this.connection.on('error', (err: Error) =>
        this.logger.error(`amqp connection error: ${err.message}`),
      );
      this.connection.on('close', () => {
        if (this.stopping) return;
        this.logger.warn('amqp connection closed, reconnecting');
        this.channel = null;
        this.connection = null;
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE, 'direct', { durable: true });
      await this.channel.assertQueue(QUEUE, { durable: true });
      await this.channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
      await this.channel.prefetch(20);

      await this.channel.consume(QUEUE, (message) => {
        if (!message) return;
        try {
          this.gateway.emitSentiment(JSON.parse(message.content.toString()));
          this.channel?.ack(message);
        } catch (err) {
          this.logger.error(`dropping unparseable result: ${(err as Error).message}`);
          // Requeueing a malformed payload would just loop forever.
          this.channel?.nack(message, false, false);
        }
      });

      this.logger.log(`consuming ${QUEUE}`);
    } catch (err) {
      this.logger.error(`failed to attach to broker: ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }
}
