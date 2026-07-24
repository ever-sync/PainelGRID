import { Capacitor } from "@capacitor/core";

/** true quando rodando dentro do app nativo (Capacitor), false no browser/web. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
