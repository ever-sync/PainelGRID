const PROTECTED_ROUTE_PATTERN =
  /^\/(gestor|cliente|vendedor|recepcao)(\/|$)/;

export function isProtectedRoutePath(path: string): boolean {
  return PROTECTED_ROUTE_PATTERN.test(path);
}
