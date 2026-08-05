import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import type { UserRole } from "../types";
import type { AppOutletContext } from "../layouts/AppLayout";

const ROLE_HOME: Record<UserRole, string> = {
  gestor: "/gestor/dashboard",
  cliente: "/cliente/dashboard",
  vendedor: "/vendedor/dashboard",
  recepcao: "/recepcao/checkin",
};

export function roleHome(role: UserRole): string {
  return ROLE_HOME[role] ?? "/login";
}

export function isRoleAllowed(
  role: UserRole,
  allow: UserRole | UserRole[],
): boolean {
  const allowed = Array.isArray(allow) ? allow : [allow];
  return allowed.includes(role);
}

export function RoleGuard({ allow }: { allow: UserRole | UserRole[] }) {
  const context = useOutletContext<AppOutletContext>();
  const { user } = context;
  if (!isRoleAllowed(user.role, allow)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  return <Outlet context={context} />;
}
