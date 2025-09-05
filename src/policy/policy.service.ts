import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import * as amqp from 'amqplib';

@Injectable()
export class PolicyService {
  private rabbitUrl = process.env.RABBIT_URL || 'amqp://admin:admin@localhost:5672';

  constructor(
    @Inject('POLICY_RMQ_CLIENT') private readonly client: ClientProxy,
  ) {}

  private async rpcCreditCheck(payload: any, timeout = 5000): Promise<any> {
    const conn = await amqp.connect(this.rabbitUrl);
    try {
      const ch = await conn.createChannel();
      const { queue: replyQueue } = await ch.assertQueue('', { exclusive: true });

      const correlationId = `${Date.now()}-${Math.random()}`;

      const response = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('RPC timeout'));
        }, timeout);

        ch.consume(
          replyQueue,
          (msg) => {
            if (!msg) return;
            if (msg.properties.correlationId === correlationId) {
              clearTimeout(timer);
              try {
                const parsed = JSON.parse(msg.content.toString());
                resolve(parsed);
              } catch (e) {
                resolve(msg.content.toString());
              } finally {
                ch.ack(msg);
              }
            } else {
              ch.nack(msg, false, true);
            }
          },
          { noAck: false }
        ).catch(reject);
      });

      await ch.assertQueue('credit_check', { durable: false });
      ch.sendToQueue('credit_check', Buffer.from(JSON.stringify(payload)), {
        replyTo: replyQueue,
        correlationId,
      });

      const result = await response;
      await ch.close();
      return result;
    } finally {
      await conn.close().catch(() => {});
    }
  }

  async issuePolicy(dto: Record<string, any>) {
    const creditResponse = await this.rpcCreditCheck(dto, 5000);
    if (!creditResponse || creditResponse.approved !== true) {
      throw new BadRequestException('Credit not approved');
    }
    const policyId = Date.now();

    // Determine amount. Assume caller provides `amount`; fall back to `premium` or 0.
    const amount = typeof dto.amount === 'number' ? dto.amount : (typeof dto.premium === 'number' ? dto.premium : 0);

    // Publish directly to named queues so they appear in the management UI.
    // We assert queues first to ensure they exist, then send messages to the default exchange
    // with routing key equal to the queue name.
    try {
      const pubConn = await amqp.connect(this.rabbitUrl);
      try {
        const pubCh = await pubConn.createChannel();
        await pubCh.assertQueue('billing_event', { durable: true });
        await pubCh.assertQueue('accounting_event', { durable: true });

        pubCh.sendToQueue('billing_event', Buffer.from(JSON.stringify({ policyId, amount })), { persistent: true });
        pubCh.sendToQueue('accounting_event', Buffer.from(JSON.stringify({ policyId, revenue: amount })), { persistent: true });

        await pubCh.close();
      } finally {
        await pubConn.close().catch(() => {});
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to publish to billing/accounting queues', err);
    }

    return { status: 'issued', policyId, ...dto };
  }
}
