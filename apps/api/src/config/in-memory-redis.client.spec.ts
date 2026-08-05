import { InMemoryRedisClient } from "./in-memory-redis.client";

describe("InMemoryRedisClient 2FA", () => {
  let redis: InMemoryRedisClient;

  beforeEach(() => {
    redis = new InMemoryRedisClient();
  });

  it("consome um desafio valido uma unica vez", async () => {
    const payload = JSON.stringify({
      codeHash: "hash-correto",
      attempts: 0,
      userId: "user-1",
    });
    await redis.set("auth:2fa:token", payload, "EX", 600);

    await expect(
      redis.consumeTwoFactorChallenge("auth:2fa:token", "hash-correto", 5),
    ).resolves.toEqual({ status: "valid", payload });
    await expect(
      redis.consumeTwoFactorChallenge("auth:2fa:token", "hash-correto", 5),
    ).resolves.toEqual({ status: "missing" });
  });

  it("invalida o desafio depois de cinco codigos incorretos", async () => {
    await redis.set(
      "auth:2fa:token",
      JSON.stringify({ codeHash: "hash-correto", attempts: 0 }),
      "EX",
      600,
    );

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(
        redis.consumeTwoFactorChallenge("auth:2fa:token", "errado", 5),
      ).resolves.toEqual({ status: "invalid" });
    }
    await expect(
      redis.consumeTwoFactorChallenge("auth:2fa:token", "errado", 5),
    ).resolves.toEqual({ status: "locked" });
    await expect(
      redis.consumeTwoFactorChallenge("auth:2fa:token", "hash-correto", 5),
    ).resolves.toEqual({ status: "missing" });
  });
});
