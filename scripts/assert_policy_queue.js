#!/usr/bin/env node
const amqp = require('amqplib');

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://admin:admin@localhost:5672';
const QUEUE = process.env.QUEUE || 'policy_queue';

(async () => {
  try {
    console.log(`Connecting to ${RABBIT_URL}...`);
    const conn = await amqp.connect(RABBIT_URL);
    const ch = await conn.createChannel();
    await ch.assertQueue(QUEUE, { durable: true });
    console.log(`Queue asserted: ${QUEUE}`);
    await ch.close();
    await conn.close();
    process.exit(0);
  } catch (err) {
    console.error('Failed to assert queue:', err);
    process.exit(1);
  }
})();
