import { isRoleAllowed, roleHome } from "./RoleGuard";

describe("RoleGuard policy", () => {
  it.each([
    ["gestor", "/gestor/dashboard"],
    ["cliente", "/cliente/dashboard"],
    ["vendedor", "/vendedor/dashboard"],
    ["recepcao", "/recepcao/checkin"],
  ] as const)("direciona %s para sua pagina inicial", (role, home) => {
    expect(roleHome(role)).toBe(home);
  });

  it("aceita um unico perfil permitido", () => {
    expect(isRoleAllowed("gestor", "gestor")).toBe(true);
    expect(isRoleAllowed("cliente", "gestor")).toBe(false);
  });

  it("aceita uma lista de perfis permitidos", () => {
    expect(isRoleAllowed("vendedor", ["cliente", "vendedor"])).toBe(true);
    expect(isRoleAllowed("recepcao", ["cliente", "vendedor"])).toBe(false);
  });
});
