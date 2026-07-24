import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

const HEADER = 'x-leadflow-integration-key';

@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('LEADFLOW_INTEGRATION_API_KEY')?.trim();
    if (!expected) {
      throw new UnauthorizedException('Integracao por chave nao configurada');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const provided = String(req.headers[HEADER] ?? '').trim();
    if (!provided || provided.length !== expected.length) {
      throw new UnauthorizedException('Chave de integracao invalida');
    }

    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Chave de integracao invalida');
    }

    return true;
  }
}
