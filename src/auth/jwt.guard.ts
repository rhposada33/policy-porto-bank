import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || '';
const SECRET = process.env.JWT_SECRET || 'dev-secret';

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req: Request = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (!auth || Array.isArray(auth)) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const parts = (auth as string).split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid Authorization header');
    }
    const token = parts[1];

    try {
      // If a public key is provided, try RS256 verification, otherwise use shared secret
      const payload = PUBLIC_KEY
        ? jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] })
        : jwt.verify(token, SECRET, { algorithms: ['HS256'] });
      // attach user to request for handlers if needed
      (req as any).user = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
