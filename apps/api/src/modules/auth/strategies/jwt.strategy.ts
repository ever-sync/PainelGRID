import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../../../common/types';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../auth.types';

/**
 * JwtStrategy valida o token local de acesso (HS256) gerado pelo backend.
 * Identificado por `payload.sub` ser o ID do usuario e `payload.type === 'access'`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'leadflow_access_secret'),
    });
  }

  async validate(payload: { sub?: unknown; type?: unknown }): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token de acesso invalido');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Token de acesso invalido');
    }

    const user = await this.usersService.getEntityById(payload.sub).catch(() => null);

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Token de acesso invalido');
    }

    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      client_id: user.client_id ?? null,
    };
  }
}
