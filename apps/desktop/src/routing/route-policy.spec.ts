import { isProtectedRoutePath } from "./route-policy";

describe("isProtectedRoutePath", () => {
  it.each([
    "/gestor/dashboard",
    "/cliente/leads",
    "/vendedor",
    "/recepcao/checkin",
    "/eventos/event-1/tv",
    "/eventos/event-1/tv-fila",
    "/eventos/event-1/tv/",
  ])("identifica a area protegida %s", (path) => {
    expect(isProtectedRoutePath(path)).toBe(true);
  });

  it.each([
    "/login",
    "/convite",
    "/avaliacao/token",
    "/gestoria",
    "/eventos/event-1/tv-outra",
  ])("nao exige bootstrap de refresh na rota %s", (path) => {
    expect(isProtectedRoutePath(path)).toBe(false);
  });
});
