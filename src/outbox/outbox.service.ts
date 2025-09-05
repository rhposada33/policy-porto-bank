import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import * as amqp from 'amqplib';

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly pollIntervalMs = Number(process.env.OUTBOX_POLL_MS || 1000);
  private pool: Pool | null = null;
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private rabbitUrl = process.env.RABBIT_URL || 'amqp://admin:admin@localhost:5672';

  onModuleInit() {
    const pgHost = process.env.PGHOST || 'localhost';
    const pgPort = Number(process.env.PGPORT || 5432);
    const pgUser = process.env.PGUSER || 'postgres';
    const pgPass = process.env.PGPASSWORD || 'postgres';
    const pgDb = process.env.PGDATABASE || 'policydb';
    this.pool = new Pool({ host: pgHost, port: pgPort, user: pgUser, password: pgPass, database: pgDb });
    this.start();
  }

  onModuleDestroy() {
    this.stop();
    if (this.pool) this.pool.end().catch(() => {});
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.runOnce().catch((e) => this.logger.error('Outbox run failed', e)), this.pollIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce() {
    if (!this.pool) {
      this.logger.warn('No DB pool configured for outbox dispatcher');
      return;
    }

    const client = await this.pool.connect();
    try {
      // select a small batch of unprocessed messages
      const res = await client.query('SELECT id, aggregate_type, aggregate_id, type, payload FROM outbox WHERE processed = false ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10');
      if (res.rowCount === 0) return;

      const conn = await amqp.connect(this.rabbitUrl);
      try {
        const ch = await conn.createChannel();
        for (const row of res.rows) {
          const queue = this.mapTypeToQueue(row.type);
          try {
            await ch.assertQueue(queue, { durable: true });
            ch.sendToQueue(queue, Buffer.from(JSON.stringify(row.payload)), { persistent: true });
            await client.query('UPDATE outbox SET processed = true WHERE id = $1', [row.id]);
          } catch (err) {
            this.logger.error('Failed to process outbox row ' + row.id, err);
          }
        }
        await ch.close();
      } finally {
        await conn.close().catch(() => {});
      }
    } finally {
      client.release();
    }
  }

  private mapTypeToQueue(type: string) {
    // simple mapping: "billing.event" -> "billing_event"
    return type.replace('.', '_');
  }
}
