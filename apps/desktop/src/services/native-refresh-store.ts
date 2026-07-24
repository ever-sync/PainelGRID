import {
  KeychainAccess,
  SecureStorage,
} from "@aparajita/capacitor-secure-storage";
import { Preferences } from "@capacitor/preferences";

/**
 * Refresh token do app nativo. No iOS fica no Keychain e no Android e cifrado com
 * chave protegida pelo Android Keystore. O item nao sincroniza com nuvem nem migra
 * para outro dispositivo.
 */
const SECURE_STORAGE_PREFIX = "painelgrid.auth.";
const SECURE_REFRESH_TOKEN_KEY = "refresh_token";
const LEGACY_PREFERENCES_KEY = "painelgrid.auth.native_refresh_token";

const secureStorageReady = Promise.all([
  SecureStorage.setKeyPrefix(SECURE_STORAGE_PREFIX),
  SecureStorage.setSynchronize(false),
  SecureStorage.setDefaultKeychainAccess(
    KeychainAccess.whenUnlockedThisDeviceOnly,
  ),
]).then(() => undefined);

export async function readNativeRefreshToken(): Promise<string | null> {
  await secureStorageReady;
  const secureToken = await SecureStorage.getItem(SECURE_REFRESH_TOKEN_KEY);
  if (secureToken) {
    return secureToken;
  }

  // Migra uma unica vez versoes antigas que usavam Preferences sem criptografia.
  const { value: legacyToken } = await Preferences.get({
    key: LEGACY_PREFERENCES_KEY,
  });
  if (!legacyToken) {
    return null;
  }

  await SecureStorage.setItem(SECURE_REFRESH_TOKEN_KEY, legacyToken);
  await Preferences.remove({ key: LEGACY_PREFERENCES_KEY });
  return legacyToken;
}

export async function writeNativeRefreshToken(token: string): Promise<void> {
  await secureStorageReady;
  await SecureStorage.setItem(SECURE_REFRESH_TOKEN_KEY, token);
  await Preferences.remove({ key: LEGACY_PREFERENCES_KEY });
}

export async function clearNativeRefreshToken(): Promise<void> {
  await secureStorageReady;
  await Promise.all([
    SecureStorage.removeItem(SECURE_REFRESH_TOKEN_KEY),
    Preferences.remove({ key: LEGACY_PREFERENCES_KEY }),
  ]);
}
