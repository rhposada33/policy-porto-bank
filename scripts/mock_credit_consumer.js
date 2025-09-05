#!/usr/bin/env node
const amqp = require('amqplib');

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://admin:admin@localhost:5672';
const QUEUE = process.env.QUEUE || 'policy_queue';
const APPROVE = process.env.APPROVE !== 'false';

(async () => {
  const conn = await amqp.connect(RABBIT_URL);
  const ch = await conn.createChannel();

  // Using direct RPC pattern: listen on a temporary queue for credit_check requests
  await ch.assertQueue('credit_check', { durable: false });
  ch.consume('credit_check', async (msg) => {
    if (!msg) return;
    const body = msg.content.toString();
    console.log('Received credit_check:', body);
    const reply = { approved: APPROVE };
    ch.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(reply)), {
      correlationId: msg.properties.correlationId,
    });
    ch.ack(msg);
  });

  console.log('Mock credit consumer listening on credit_check. APPROVE=', APPROVE);
})();
