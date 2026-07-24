import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import type { User, UserRole } from "../types";
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

export function RoleGuard({ allow }: { allow: UserRole | UserRole[] }) {
  const context = useOutletContext<AppOutletContext>();
  const { user } = context;
  const allowed = Array.isArray(allow) ? allow : [allow];
  if (!allowed.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  return <Outlet context={context} />;
}
