import { BadRequestException } from '@nestjs/common';
import { PolicyService } from './policy.service';

jest.mock('amqplib');
import * as amqp from 'amqplib';

describe('PolicyService', () => {
  let createdChannels: any[];
  let rpcResponseDefault: any;

  beforeEach(() => {
    jest.resetAllMocks();
    createdChannels = [];
    rpcResponseDefault = { approved: true };

    // @ts-ignore - jest mocked
    (amqp.connect as jest.Mock).mockImplementation(async () => {
      const ch: any = {
        _consumers: {} as Record<string, Function>,
        _nextRpcResponse: undefined,
        assertQueue: jest.fn(async (name?: string) => (name === '' ? { queue: 'amq.gen-reply-queue' } : { queue: name })),
        consume: jest.fn(async (queue: string, handler: any) => {
          ch._consumers[queue] = handler;
          return { consumerTag: 'ctag' };
        }),
        sendToQueue: jest.fn((q: string, _content: Buffer, opts: any) => {
          if (q === 'credit_check') {
            const replyTo = opts?.replyTo;
            const corr = opts?.correlationId;
            const handler = ch._consumers[replyTo];
            const response = ch._nextRpcResponse ?? rpcResponseDefault;
            if (handler) {
              const msg = {
                properties: { correlationId: corr },
                content: Buffer.from(JSON.stringify(response)),
              } as any;
              setImmediate(() => handler(msg));
            }
          }
        }),
        ack: jest.fn(),
        nack: jest.fn(),
        close: jest.fn(async () => undefined),
      };

      createdChannels.push(ch);

      const conn = {
        createChannel: jest.fn(async () => ch),
        close: jest.fn(async () => undefined),
      } as any;

      return conn;
    });
  });

  it('should return issued when credit check returns approved', async () => {
    const service = new PolicyService({} as any);

    const dto = { amount: 123, holder: 'Alice' };

    const res = await service.issuePolicy(dto);

    expect(res).toBeDefined();
    expect((res as any).status).toBe('issued');
    expect((res as any).policyId).toBeGreaterThan(0);
    expect((res as any).holder).toBe('Alice');

    expect(createdChannels.length).toBeGreaterThanOrEqual(2);

    const pubCh = createdChannels[1];
    const publishedQueues = pubCh.sendToQueue.mock.calls.map((c: any[]) => c[0]);
    expect(publishedQueues).toEqual(expect.arrayContaining(['billing_event', 'accounting_event']));
  });

  it('should throw BadRequestException when credit check not approved', async () => {
    const service = new PolicyService({} as any);

    rpcResponseDefault = { approved: false };

    await expect(service.issuePolicy({ id: 'x' })).rejects.toThrow(BadRequestException);
  });
});

