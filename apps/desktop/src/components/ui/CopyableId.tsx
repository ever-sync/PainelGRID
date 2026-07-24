import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyableIdProps {
  /** Valor a ser copiado (ex.: UUID do cliente ou do evento). */
  value: string;
  /** Rótulo curto exibido antes do valor. */
  label?: string;
  /** Estilo para fundo escuro (ex.: cabeçalho da tela de evento). */
  dark?: boolean;
  className?: string;
}

/**
 * Exibe um identificador (UUID) com botão de copiar.
 * Usado para facilitar a cópia do client_id / event_id em integrações.
 */
export function CopyableId({
  value,
  label = "ID",
  dark = false,
  className = "",
}: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const base = dark
    ? "border-white/15 bg-white/10 text-zinc-200 hover:bg-white/20"
    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100";

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copiar ${label}: ${value}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs transition-colors ${base} ${className}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
        {label}
      </span>
      <span className="max-w-[220px] truncate">{value}</span>
      {copied ? (
        <Check size={12} className="text-green-500" />
      ) : (
        <Copy size={12} className="opacity-70" />
      )}
    </button>
  );
}
