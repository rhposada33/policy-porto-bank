import { Injectable, BadRequestException } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class PolicyService {
  private rabbitUrl = process.env.RABBIT_URL || 'amqp://admin:admin@localhost:5672';

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
    return { status: 'issued', policyId: Date.now(), ...dto };
  }
}
