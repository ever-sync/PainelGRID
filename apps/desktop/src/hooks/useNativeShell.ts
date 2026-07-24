import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { isNativePlatform } from "../utils/platform";

/**
 * Integracao com o "shell" nativo do Capacitor: botao voltar do Android (sem isso o
 * gesto/hardware back sai do app em vez de navegar) e status bar. `ready` controla o
 * momento de esconder a splash screen (apos o bootstrap de auth em App.tsx).
 */
export function useNativeShell(ready: boolean): void {
  useEffect(() => {
    if (!isNativePlatform()) return;

    const backButtonListener = CapacitorApp.addListener("backButton", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        void CapacitorApp.exitApp();
      }
    });

    void StatusBar.setStyle({ style: Style.Light }).catch(() => {
      /* dispositivo sem suporte: ignora */
    });

    return () => {
      void backButtonListener.then((listener) => listener.remove());
    };
  }, []);

  useEffect(() => {
    if (!isNativePlatform() || !ready) return;
    void SplashScreen.hide().catch(() => {
      /* splash ja escondida ou indisponivel: ignora */
    });
  }, [ready]);
}
