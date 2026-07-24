import { Preferences } from "@capacitor/preferences";

/**
 * Refresh token do app nativo (Capacitor). O cookie httpOnly cross-site usado na web
 * nao e confiavel dentro da WebView nativa, entao o app guarda o refresh token aqui
 * (armazenamento nativo do SO via Preferences) e o envia manualmente no corpo das
 * chamadas a /auth/refresh e /auth/logout.
 */
const NATIVE_REFRESH_TOKEN_KEY = "painelgrid.auth.native_refresh_token";

export async function readNativeRefreshToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: NATIVE_REFRESH_TOKEN_KEY });
  return value ?? null;
}

export async function writeNativeRefreshToken(token: string): Promise<void> {
  await Preferences.set({ key: NATIVE_REFRESH_TOKEN_KEY, value: token });
}

export async function clearNativeRefreshToken(): Promise<void> {
  await Preferences.remove({ key: NATIVE_REFRESH_TOKEN_KEY });
}
