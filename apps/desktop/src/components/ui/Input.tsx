import { type ReactNode, forwardRef } from "react";
import {
  Input as InputPrimitive,
  type InputProps as InputPrimitiveProps,
} from "react-aria-components";
import { cn } from "../../lib/utils";

interface InputProps extends InputPrimitiveProps {
  label?: string;
  error?: string;
  icon?: ReactNode;
  /** @deprecated dark mode agora e global via classe `.dark` (ver dashboard-dark-mode.ts); sem efeito aqui. */
  dark?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, id, dark: _dark, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icon}
            </span>
          )}
          <InputPrimitive
            id={inputId}
            ref={ref}
            data-slot="input"
            className={cn(
              "h-9 w-full min-w-0 rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive focus-visible:ring-destructive/20",
              icon && "pl-10",
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
