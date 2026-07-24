import { isValidElement, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { pushToast } from "./Toast";

type NoticeTone = "error" | "success" | "warning" | "info";

export function Notice({
  children,
  tone = "info",
  className: _className,
}: {
  children: ReactNode;
  tone?: NoticeTone;
  className?: string;
}) {
  const text = useMemo(() => {
    const flatten = (node: ReactNode): string => {
      if (node == null || typeof node === "boolean") return "";
      if (typeof node === "string" || typeof node === "number")
        return String(node);
      if (Array.isArray(node)) return node.map(flatten).join(" ");
      if (isValidElement(node)) {
        return flatten(node.props.children);
      }
      return "";
    };

    return flatten(children).trim();
  }, [children]);

  useEffect(() => {
    if (!text) return;
    pushToast({ message: text, type: tone });
  }, [text, tone]);

  return null;
}
