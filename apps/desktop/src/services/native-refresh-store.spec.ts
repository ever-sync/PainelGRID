const mockSecureStorage = {
  setKeyPrefix: jest.fn().mockResolvedValue(undefined),
  setSynchronize: jest.fn().mockResolvedValue(undefined),
  setDefaultKeychainAccess: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

const mockPreferences = {
  get: jest.fn(),
  remove: jest.fn(),
};

jest.mock("@aparajita/capacitor-secure-storage", () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: mockSecureStorage,
}));

jest.mock("@capacitor/preferences", () => ({
  Preferences: mockPreferences,
}));

import {
  clearNativeRefreshToken,
  readNativeRefreshToken,
  writeNativeRefreshToken,
} from "./native-refresh-store";

describe("native-refresh-store", () => {
  beforeEach(() => {
    mockSecureStorage.getItem.mockReset();
    mockSecureStorage.setItem.mockReset().mockResolvedValue(undefined);
    mockSecureStorage.removeItem.mockReset().mockResolvedValue(undefined);
    mockPreferences.get.mockReset();
    mockPreferences.remove.mockReset().mockResolvedValue(undefined);
  });

  it("le o token do armazenamento seguro sem consultar Preferences", async () => {
    mockSecureStorage.getItem.mockResolvedValue("secure-token");

    await expect(readNativeRefreshToken()).resolves.toBe("secure-token");
    expect(mockPreferences.get).not.toHaveBeenCalled();
  });

  it("migra e apaga o token legado somente depois de grava-lo com seguranca", async () => {
    mockSecureStorage.getItem.mockResolvedValue(null);
    mockPreferences.get.mockResolvedValue({ value: "legacy-token" });

    await expect(readNativeRefreshToken()).resolves.toBe("legacy-token");
    expect(mockSecureStorage.setItem).toHaveBeenCalledWith(
      "refresh_token",
      "legacy-token",
    );
    expect(mockPreferences.remove).toHaveBeenCalledWith({
      key: "painelgrid.auth.native_refresh_token",
    });
    expect(
      mockSecureStorage.setItem.mock.invocationCallOrder[0],
    ).toBeLessThan(mockPreferences.remove.mock.invocationCallOrder[0]);
  });

  it("preserva o token legado se a migracao segura falhar", async () => {
    mockSecureStorage.getItem.mockResolvedValue(null);
    mockPreferences.get.mockResolvedValue({ value: "legacy-token" });
    mockSecureStorage.setItem.mockRejectedValue(new Error("keystore indisponivel"));

    await expect(readNativeRefreshToken()).rejects.toThrow("keystore indisponivel");
    expect(mockPreferences.remove).not.toHaveBeenCalled();
  });

  it("grava no armazenamento seguro e remove qualquer copia legada", async () => {
    await writeNativeRefreshToken("rotated-token");

    expect(mockSecureStorage.setItem).toHaveBeenCalledWith(
      "refresh_token",
      "rotated-token",
    );
    expect(mockPreferences.remove).toHaveBeenCalled();
  });

  it("limpa o armazenamento seguro e o legado", async () => {
    await clearNativeRefreshToken();

    expect(mockSecureStorage.removeItem).toHaveBeenCalledWith("refresh_token");
    expect(mockPreferences.remove).toHaveBeenCalledWith({
      key: "painelgrid.auth.native_refresh_token",
    });
  });
});
