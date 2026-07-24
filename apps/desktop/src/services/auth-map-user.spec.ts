import { mapAuthApiUser } from "./auth-map-user";

describe("mapAuthApiUser", () => {
  it("mapeia os campos retornados pela API", () => {
    expect(
      mapAuthApiUser({
        id: "user-1",
        name: "Ana",
        email: "ana@example.com",
        role: "cliente",
        client_id: "client-1",
        company_name: "Empresa",
        avatar_url: "https://example.com/avatar.png",
        rating_token: "rating-token",
      }),
    ).toEqual({
      id: "user-1",
      name: "Ana",
      email: "ana@example.com",
      role: "cliente",
      client_id: "client-1",
      company_name: "Empresa",
      avatar: "https://example.com/avatar.png",
      rating_token: "rating-token",
    });
  });

  it("normaliza campos opcionais nulos para undefined", () => {
    const user = mapAuthApiUser({
      id: "user-2",
      name: "Joao",
      email: "joao@example.com",
      role: "vendedor",
      client_id: null,
      company_name: null,
      avatar_url: null,
      rating_token: null,
    });

    expect(user.client_id).toBeUndefined();
    expect(user.company_name).toBeUndefined();
    expect(user.avatar).toBeUndefined();
    expect(user.rating_token).toBeUndefined();
  });
});
