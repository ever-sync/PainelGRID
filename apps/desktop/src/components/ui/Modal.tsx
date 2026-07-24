import type { ReactNode } from "react";
import {
  Dialog,
  Heading,
  Modal as ModalPrimitive,
  ModalOverlay,
} from "react-aria-components";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
  /** @deprecated dark mode agora e global via classe `.dark`; sem efeito aqui. */
  dark?: boolean;
}

const sizeClasses = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
};

/**
 * ModalOverlay+Modal+Dialog do react-aria-components por baixo. API externa
 * (open/onClose/title/size/footer) mantida identica — RAC cuida de
 * montagem/desmontagem, foco, Escape e clique fora sozinho.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  footer,
  dark: _dark,
}: ModalProps) {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0"
    >
      <ModalPrimitive
        className={cn(
          "flex max-h-[90vh] w-full flex-col rounded-2xl bg-popover text-popover-foreground shadow-xl ring-1 ring-[#dfdfdf]/50 outline-none data-entering:animate-in data-entering:zoom-in-95 data-exiting:animate-out data-exiting:zoom-out-95",
          sizeClasses[size],
        )}
      >
        <Dialog className="flex flex-1 flex-col overflow-hidden outline-none">
          {({ close }) => (
            <>
              {title && (
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <Heading slot="title" className="text-lg font-semibold">
                    {title}
                  </Heading>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Fechar modal"
                    className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
              {footer && (
                <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                  {footer}
                </div>
              )}
            </>
          )}
        </Dialog>
      </ModalPrimitive>
    </ModalOverlay>
  );
}

// Side Drawer variant

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
  /** @deprecated dark mode agora e global via classe `.dark`; sem efeito aqui. */
  dark?: boolean;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "w-96",
  dark: _dark,
}: DrawerProps) {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      isDismissable
      className="fixed inset-0 z-50 bg-black/40 data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0"
    >
      <ModalPrimitive
        className={cn(
          "fixed inset-y-0 right-0 flex h-full flex-col bg-popover text-popover-foreground shadow-xl outline-none transition duration-200 ease-in-out data-entering:translate-x-6 data-entering:opacity-0 data-exiting:translate-x-6 data-exiting:opacity-0",
          width,
        )}
      >
        <Dialog className="flex flex-1 flex-col overflow-hidden outline-none">
          {({ close }) => (
            <>
              {title && (
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <Heading slot="title" className="text-lg font-semibold">
                    {title}
                  </Heading>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Fechar painel"
                    className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
            </>
          )}
        </Dialog>
      </ModalPrimitive>
    </ModalOverlay>
  );
}
