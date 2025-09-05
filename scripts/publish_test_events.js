#!/usr/bin/env node
const amqp = require('amqplib');

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://admin:admin@localhost:5672';

(async () => {
  const conn = await amqp.connect(RABBIT_URL);
  const ch = await conn.createChannel();
  try {
    await ch.assertQueue('billing_event', { durable: true });
    await ch.assertQueue('accounting_event', { durable: true });

    const billingMsg = { policyId: Date.now(), amount: 42.42 };
    const accountingMsg = { policyId: billingMsg.policyId, revenue: 42.42 };

    ch.sendToQueue('billing_event', Buffer.from(JSON.stringify(billingMsg)), { persistent: true });
    ch.sendToQueue('accounting_event', Buffer.from(JSON.stringify(accountingMsg)), { persistent: true });

    console.log('Published test messages to billing_event and accounting_event');
  } catch (err) {
    console.error('Publish failed', err);
    process.exitCode = 2;
  } finally {
    await ch.close().catch(()=>{});
    await conn.close().catch(()=>{});
  }
})();
