import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../layouts/AppLayout";

/**
 * Hook ergonômico para acessar o cliente selecionado pelo Gestor.
 *
 * O estado mora em `AppLayout` (Outlet context) e é persistido em
 * `localStorage('gestor:selected-client-id')`. Use este hook em qualquer
 * página/aba do Gestor para evitar:
 *   - re-implementar `useOutletContext<AppOutletContext>()` em cada página;
 *   - estados locais paralelos que perdem sincronização.
 *
 * Exemplo:
 * ```tsx
 * const { gestorClientId, setGestorClientId } = useGestorClient();
 * ```
 */
export function useGestorClient(): AppOutletContext {
  return useOutletContext<AppOutletContext>();
}
