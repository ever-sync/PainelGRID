import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { User } from "../../types";
import { readStoredSession } from "../../services/auth";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import { resolveClientId } from "../../utils/userContext";

type OutletContext = { user: User };

export function FilaPage() {
  const { user } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    const clientId = resolveClientId(user);
    if (!token || !clientId) {
      setError("Não foi possível identificar a empresa da recepção.");
      return;
    }

    void listEvents({ client_id: clientId }, token)
      .then((rows) => {
        const events = rows.map(mapApiEventToEvent);
        const event =
          events.find((item) => item.status === "active") ?? events[0];
        if (!event) {
          setError("Nenhum evento disponível para exibir a fila.");
          return;
        }
        navigate(`/eventos/${event.id}/tv-fila`, { replace: true });
      })
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar a fila de atendimento.",
        );
      });
  }, [navigate, user]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
      <p className="text-sm text-zinc-500">
        {error || "Abrindo fila de atendimento..."}
      </p>
    </div>
  );
}
