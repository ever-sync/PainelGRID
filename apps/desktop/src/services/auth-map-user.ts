import type { User, UserRole } from "../types";

/** Shape retornado pela API nos endpoints de login/refresh/me */
export type AuthApiUserPayload = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  client_id?: string | null;
  company_name?: string | null;
  avatar_url?: string | null;
  rating_token?: string | null;
};

export function mapAuthApiUser(user: AuthApiUserPayload): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    client_id: user.client_id ?? undefined,
    company_name: user.company_name ?? undefined,
    avatar: user.avatar_url ?? undefined,
    rating_token: user.rating_token ?? undefined,
  };
}
