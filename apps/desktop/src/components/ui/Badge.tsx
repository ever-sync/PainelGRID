import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-2xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        /** Cores de dominio (status/origem/plano) — mantidas do Badge anterior. */
        blue: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
        green:
          "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
        red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
        yellow:
          "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
        purple:
          "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
        orange:
          "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
        gray: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
        indigo:
          "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
        pink: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const dotVariants = cva("size-1.5 shrink-0 rounded-full", {
  variants: {
    variant: {
      default: "bg-primary-foreground",
      secondary: "bg-secondary-foreground",
      destructive: "bg-destructive",
      outline: "bg-foreground",
      ghost: "bg-foreground",
      link: "bg-primary",
      blue: "bg-sky-500",
      green: "bg-green-500",
      red: "bg-red-500",
      yellow: "bg-yellow-500",
      purple: "bg-purple-500",
      orange: "bg-orange-500",
      gray: "bg-gray-400",
      indigo: "bg-indigo-500",
      pink: "bg-pink-500",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Badge({
  className,
  variant = "default",
  dot = false,
  render,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Bolinha colorida antes do conteudo (usada pelos badges de status). */
    dot?: boolean;
    render?: (props: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
  }) {
  const content = (
    <>
      {dot && <span className={cn(dotVariants({ variant }))} />}
      {children}
    </>
  );

  if (render) {
    const renderProps = {
      "data-slot": "badge",
      "data-variant": variant,
      className: cn(badgeVariants({ variant }), className),
      children: content,
      ...props,
    };

    return render(renderProps);
  }

  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {content}
    </span>
  );
}

export { Badge, badgeVariants };

// Helpers para os badges de dominio (status/origem/plano)

type BadgeColor = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

import type {
  LeadSource,
  CrmStage,
  ConfirmationStatus,
  EventStatus,
  CampaignStatus,
  PlanType,
  UserApprovalStatus,
} from "../../types";

export function SourceBadge({ source }: { source: LeadSource }) {
  const map: Record<LeadSource, { variant: BadgeColor; label: string }> = {
    facebook_ads: { variant: "blue", label: "Facebook Ads" },
    whatsapp: { variant: "green", label: "WhatsApp" },
    manual: { variant: "gray", label: "Manual" },
    form_page: { variant: "purple", label: "Formulário" },
    import_excel: { variant: "gray", label: "Importação" },
  };
  const { variant, label } = map[source];
  return <Badge variant={variant}>{label}</Badge>;
}

export function StageBadge({ stage }: { stage: CrmStage }) {
  const map: Record<CrmStage, { variant: BadgeColor; label: string }> = {
    novo: { variant: "blue", label: "Novo" },
    contactado: { variant: "indigo", label: "Contactado" },
    nao_responde: { variant: "orange", label: "Não responde" },
    agendado: { variant: "yellow", label: "Agendado" },
    checkin: { variant: "purple", label: "Check-in" },
    convertido: { variant: "green", label: "Convertido" },
    perdido: { variant: "red", label: "Perdido" },
  };
  const { variant, label } = map[stage];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ConfirmationBadge({
  status,
  closedLabel = "Encerrado",
}: {
  status: ConfirmationStatus;
  closedLabel?: string;
}) {
  const map: Record<
    ConfirmationStatus,
    { variant: BadgeColor; label: string }
  > = {
    pending: { variant: "yellow", label: "Pendente" },
    scheduled: { variant: "orange", label: "Agendado" },
    confirmed: { variant: "green", label: "Confirmado" },
    cancelled: { variant: "red", label: "Cancelado" },
    checked_in: { variant: "blue", label: "Check-in" },
    closed: { variant: "gray", label: closedLabel },
  };
  const { variant, label } = map[status];
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

/**
 * Combina os dois eixos independentes: aprovacao do auto-cadastro e ativacao manual.
 * Pendente/Recusado vem de `approval_status`; so quem esta aprovado mostra Ativo/Inativo.
 */
export function ApprovalStatusBadge({
  status = "approved",
  isActive,
}: {
  status?: UserApprovalStatus;
  isActive: boolean;
}) {
  if (status === "pending") {
    return (
      <Badge variant="yellow" dot>
        Pendente
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="red" dot>
        Recusado
      </Badge>
    );
  }
  return isActive ? (
    <Badge variant="green" dot>
      Ativo
    </Badge>
  ) : (
    <Badge variant="gray" dot>
      Inativo
    </Badge>
  );
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const map: Record<EventStatus, { variant: BadgeColor; label: string }> = {
    draft: { variant: "gray", label: "Rascunho" },
    active: { variant: "green", label: "Ativo" },
    completed: { variant: "blue", label: "Concluído" },
    cancelled: { variant: "red", label: "Cancelado" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { variant: BadgeColor; label: string }> = {
    active: { variant: "green", label: "Ativa" },
    paused: { variant: "yellow", label: "Pausada" },
    finished: { variant: "gray", label: "Finalizada" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function PlanBadge({ plan }: { plan: PlanType }) {
  const map: Record<PlanType, { variant: BadgeColor; label: string }> = {
    starter: { variant: "gray", label: "Starter" },
    pro: { variant: "blue", label: "Pro" },
    enterprise: { variant: "purple", label: "Enterprise" },
  };
  const { variant, label } = map[plan];
  return <Badge variant={variant}>{label}</Badge>;
}
