import { isProtectedRoutePath } from "./route-policy";

describe("isProtectedRoutePath", () => {
  it.each([
    "/gestor/dashboard",
    "/cliente/leads",
    "/vendedor",
    "/recepcao/checkin",
  ])("identifica a area protegida %s", (path) => {
    expect(isProtectedRoutePath(path)).toBe(true);
  });

  it.each([
    "/login",
    "/convite",
    "/avaliacao/token",
    "/gestoria",
    "/eventos/event-1/tv",
  ])("nao exige bootstrap de refresh na rota %s", (path) => {
    expect(isProtectedRoutePath(path)).toBe(false);
  });
});
