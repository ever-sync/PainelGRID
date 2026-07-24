import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { isNativePlatform } from "./platform";

/**
 * navigator.vibrate() nao existe no WKWebView (iOS) e e inconsistente no WebView do Android.
 * No nativo usa o plugin Haptics; no browser cai para a Vibration API como antes.
 */
export function triggerHapticFeedback(pattern: number | number[] = 150): void {
  if (isNativePlatform()) {
    void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {
      /* dispositivo sem suporte a haptics: ignora */
    });
    return;
  }

  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}
