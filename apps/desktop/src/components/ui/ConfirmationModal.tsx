import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  dark?: boolean;
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onClose,
  loading = false,
  dark,
}: ConfirmationModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      dark={dark}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} isDisabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2">{description}</div>
    </Modal>
  );
}
