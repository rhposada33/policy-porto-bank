import { Injectable } from '@nestjs/common';

@Injectable()
export class PolicyService {
  issuePolicy(dto: Record<string, any>) {
    return { status: 'issued', policyId: Date.now(), ...dto };
  }
}
