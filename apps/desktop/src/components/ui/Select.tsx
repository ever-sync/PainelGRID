import {
  Button as ButtonPrimitive,
  ListBox,
  ListBoxItem,
  Popover,
  Select as SelectPrimitive,
  SelectValue,
} from "react-aria-components";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** @deprecated dark mode agora e global via classe `.dark`; sem efeito aqui. */
  dark?: boolean;
}

/**
 * Wrapper de API simples (value/onValueChange/onChange) sobre o Select composto do
 * react-aria-components — as ~30 chamadas no app so precisam de um dropdown
 * de valor unico, sem busca/grupos/multi-select, entao essas partes do
 * gerador shadcn foram descartadas.
 */
export function Select({
  label,
  options,
  placeholder,
  error,
  value,
  onChange,
  onValueChange,
  disabled,
  className,
  id,
  dark: _dark,
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  const errorId = error && selectId ? `${selectId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span
          id={selectId ? `${selectId}-label` : undefined}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </span>
      )}
      <SelectPrimitive
        aria-label={label ?? placeholder ?? "Selecionar"}
        aria-describedby={errorId}
        placeholder={placeholder}
        selectedKey={value ?? null}
        onSelectionChange={(key) => {
          const val = key == null ? "" : String(key);
          onValueChange?.(val);
          onChange?.({ target: { value: val } });
        }}
        isDisabled={disabled}
        isInvalid={Boolean(error)}
      >
        <ButtonPrimitive
          data-slot="select-trigger"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-1.5 rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground",
            error && "border-destructive focus-visible:ring-destructive/20",
            className,
          )}
        >
          <SelectValue className="flex-1 truncate text-left" />
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </ButtonPrimitive>
        <Popover
          className="z-50 w-[var(--trigger-width)] min-w-36 overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-[#dfdfdf]/50"
          offset={4}
        >
          <ListBox className="max-h-72 overflow-y-auto p-1 outline-none">
            {options.map((opt) => (
              <ListBoxItem
                key={opt.value}
                id={opt.value}
                textValue={opt.label}
                className="relative flex min-h-8 w-full cursor-default items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-sm outline-none data-[selected]:bg-accent data-[selected]:text-accent-foreground data-[focused]:bg-accent data-[focused]:text-accent-foreground"
              >
                {({ isSelected }) => (
                  <>
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </>
                )}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </SelectPrimitive>
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
