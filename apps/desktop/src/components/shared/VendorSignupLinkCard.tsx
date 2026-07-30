import { useState } from "react";
import { Check, Copy, Link2, RefreshCcw, Share2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { rotateVendorSignupLink } from "../../services/clients";
import { copyToClipboard } from "../../utils/clipboard";
import { resolvePublicWebOrigin } from "../../utils/publicWebOrigin";

interface VendorSignupLinkCardProps {
  clientId: string;
  companyName: string;
  signupToken: string | null | undefined;
  accessToken: string;
  /** Gestor dono e o proprio cliente podem trocar; demais perfis so copiam. */
  canRotate?: boolean;
  onRotated?: (token: string) => void;
  onNotify?: (message: string, type: "success" | "error") => void;
}

export function VendorSignupLinkCard({
  clientId,
  companyName,
  signupToken,
  accessToken,
  canRotate = false,
  onRotated,
  onNotify,
}: VendorSignupLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [rotating, setRotating] = useState(false);

  const origin = resolvePublicWebOrigin();
  const url = signupToken ? `${origin}/cadastro-vendedor/${signupToken}` : "";

  async function handleCopy() {
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
    onNotify?.(
      ok
        ? "Link copiado. Cole no grupo do WhatsApp."
        : "Não foi possível copiar. Selecione o link manualmente.",
      ok ? "success" : "error",
    );
  }

  function handleShareWhatsapp() {
    if (!url) return;
    const text =
      `Cadastro de vendedores — ${companyName}\n\n` +
      `Preencha seus dados neste link:\n${url}\n\n` +
      `Depois que a empresa aprovar, você recebe um e-mail para criar sua senha.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function handleRotate() {
    setRotating(true);
    try {
      const result = await rotateVendorSignupLink(clientId, accessToken);
      onRotated?.(result.vendor_signup_token);
      setConfirmingRotate(false);
      onNotify?.("Link trocado. O anterior deixou de funcionar.", "success");
    } catch {
      onNotify?.("Não foi possível trocar o link. Tente de novo.", "error");
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            <Link2 size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Link de cadastro de vendedores
            </h3>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Compartilhe no grupo da equipe. Cada cadastro entra como{" "}
              <strong>Pendente</strong> e só ganha acesso depois que você
              aprovar.
            </p>
          </div>
        </div>

        {canRotate && signupToken ? (
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCcw size={14} />}
            onClick={() => setConfirmingRotate(true)}
          >
            Trocar link
          </Button>
        ) : null}
      </div>

      {signupToken ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-blue-200 bg-white px-3 py-2 font-mono text-xs text-gray-800 select-all dark:border-blue-900/40 dark:bg-gray-900 dark:text-gray-200">
            {url}
          </code>
          <Button
            size="sm"
            icon={copied ? <Check size={14} /> : <Copy size={14} />}
            onClick={handleCopy}
          >
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Share2 size={14} />}
            onClick={handleShareWhatsapp}
          >
            WhatsApp
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Link ainda não gerado. Recarregue a página para criá-lo.
        </p>
      )}

      <Modal
        open={confirmingRotate}
        onClose={() => setConfirmingRotate(false)}
        title="Trocar link de cadastro"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmingRotate(false)}
              isDisabled={rotating}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRotate}
              loading={rotating}
            >
              Trocar link
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          O link atual deixa de funcionar imediatamente. Quem já se cadastrou{" "}
          <strong>não é afetado</strong> — só será preciso reenviar o link novo
          para quem ainda não preencheu.
        </p>
      </Modal>
    </div>
  );
}
