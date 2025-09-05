import { Controller, Post, Body } from '@nestjs/common';
import { PolicyService } from './policy.service';

@Controller('policy')
export class PolicyController {
  constructor(private readonly service: PolicyService) {}

  @Post('issue')
  issue(@Body() dto: Record<string, any>) {
    return this.service.issuePolicy(dto);
  }
}
