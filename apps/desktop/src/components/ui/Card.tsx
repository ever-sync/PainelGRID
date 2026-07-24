import type * as React from "react";
import { cn } from "../../lib/utils";

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

interface CardProps extends React.ComponentProps<"div"> {
  padding?: keyof typeof paddingClasses;
}

/**
 * Base shadcn (token bg-card/ring-foreground), mas mantida como div unica
 * (sem CardHeader/CardContent/CardFooter): as ~20 paginas que usam Card hoje
 * passam conteudo livre, nao a estrutura compound do gerador. A sintaxe
 * `py-(--x)`/`rounded-[min(var(--x),24px)]` do gerador e Tailwind v4-only;
 * este projeto usa v3, entao os valores ficam fixos em vez de variaveis.
 */
function Card({ className, padding = "md", ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-3xl bg-card text-card-foreground shadow-sm ring-1 ring-[#dfdfdf]/50",
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
}

export { Card };
