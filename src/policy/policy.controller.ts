import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { JwtGuard } from '../auth/jwt.guard';

@Controller('policy')
export class PolicyController {
  constructor(private readonly service: PolicyService) {}

  @UseGuards(JwtGuard)
  @Post('issue')
  issue(@Body() dto: Record<string, any>) {
    return this.service.issuePolicy(dto);
  }
}
