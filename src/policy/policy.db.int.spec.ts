import { Pool } from 'pg';
import { PolicyService } from './policy.service';

// This integration test requires a running Postgres (see docker-compose.yml). It will skip if PG connection fails.

describe('PolicyService integration with Postgres outbox', () => {
  let pool: Pool;
  let service: PolicyService;

  beforeAll(async () => {
    pool = new Pool({ host: process.env.PGHOST || 'localhost', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD || 'postgres', database: process.env.PGDATABASE || 'policydb' });
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      // Skip tests when DB not available
      // eslint-disable-next-line no-console
      console.warn('Postgres not available, skipping DB integration tests');
      pool = null as any;
      return;
    }

    service = new PolicyService({} as any);
    // manually set db pool
    (service as any).db = pool;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('writes policy and outbox entries', async () => {
    if (!pool) return;

    const dto = { amount: 321.5, holder: 'IntegrationTest' } as any;
    const res = await service.issuePolicy(dto);
    expect(res).toBeDefined();
    expect(res.status).toBe('issued');

    const policyRow = await pool.query('SELECT * FROM policies WHERE id = $1', [res.policyId]);
    expect(policyRow.rowCount).toBe(1);
    const outboxRows = await pool.query('SELECT * FROM outbox WHERE aggregate_id = $1 ORDER BY id', [res.policyId]);
    expect(outboxRows.rowCount).toBe(2);
  });
});
