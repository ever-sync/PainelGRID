import type { Request } from 'express';

/** Request autenticado por uma credencial de integracao vinculada a um cliente. */
export type IntegrationRequest = Request & {
  integrationClientId?: string;
};
