import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PolicyModule } from './policy/policy.module';
import { OutboxDispatcherService } from './outbox/outbox.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'POLICY_RMQ_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://admin:admin@localhost:5672'],
          queue: 'policy_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  PolicyModule,
  ],
  controllers: [AppController],
  providers: [AppService, OutboxDispatcherService],
})
export class AppModule {}
