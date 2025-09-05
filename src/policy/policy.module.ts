import { Module } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';

@Module({
  providers: [PolicyService],
  controllers: [PolicyController],
  exports: [PolicyService],
})
export class PolicyModule {}
