import { OutboxDispatcherService } from './outbox.service';
import * as amqp from 'amqplib';
import { Pool } from 'pg';

jest.mock('amqplib');
jest.mock('pg');

describe('OutboxDispatcherService', () => {
  let service: OutboxDispatcherService;
  let createdClient: any;

  beforeEach(() => {
    jest.resetAllMocks();

    // Mock pg Pool
    createdClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    const mockPool: any = jest.fn(() => ({ connect: jest.fn(async () => createdClient), end: jest.fn() }));
    (Pool as unknown as jest.Mock).mockImplementation(mockPool as any);

    // Mock amqplib
    const ch = {
      assertQueue: jest.fn(async () => ({})),
      sendToQueue: jest.fn(() => {}),
      close: jest.fn(async () => {}),
    };
    const conn = { createChannel: jest.fn(async () => ch), close: jest.fn(async () => {}) };
    (amqp.connect as unknown as jest.Mock).mockResolvedValue(conn);

    service = new OutboxDispatcherService();
    (service as any).pool = { connect: async () => createdClient } as any;
  });

  it('processes outbox rows and marks them processed', async () => {
    createdClient.query.mockImplementationOnce(async () => ({ rowCount: 1, rows: [{ id: 1, type: 'billing.event', payload: { policyId: 1 } }] }));
    createdClient.query.mockImplementationOnce(async () => ({ rowCount: 0 }));

    await service.runOnce();

    expect(createdClient.query).toHaveBeenCalled();
    // After sending, we update processed
    expect(createdClient.query).toHaveBeenCalledWith('UPDATE outbox SET processed = true WHERE id = $1', [1]);
  });
});
