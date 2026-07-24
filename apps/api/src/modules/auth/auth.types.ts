import { Role } from '../../common/types';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  client_id?: string | null;
  type: 'access' | 'refresh';
  jti?: string;
  /** Apenas no refresh: propaga a escolha de "lembrar-me" a cada rotacao do token. */
  remember?: boolean;
}

export interface AuthenticatedUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
  client_id?: string | null;
}
