import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-2xl border border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-all outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[#FF0636] text-white hover:bg-[#e1002d] shadow-sm cursor-pointer",
        outline:
          "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 dark:text-zinc-200 shadow-sm cursor-pointer",
        secondary:
          "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 shadow-sm cursor-pointer",
        ghost:
          "hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 text-zinc-700 dark:text-zinc-300 font-semibold cursor-pointer",
        destructive:
          "bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:bg-red-500/20 dark:hover:bg-red-500/30 cursor-pointer",
        success:
          "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 shadow-sm cursor-pointer",
        link: "text-[#FF0636] underline-offset-4 hover:underline cursor-pointer",
      },
      size: {
        default: "h-10 gap-2 px-4 text-xs sm:text-sm font-bold rounded-2xl",
        xs: "h-7 gap-1 px-2.5 text-[11px] font-semibold rounded-lg [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-xs font-semibold rounded-xl",
        lg: "h-11 gap-2 px-5 text-xs sm:text-sm font-bold rounded-2xl",
        xl: "h-12 gap-2.5 px-6 text-sm font-extrabold rounded-2xl",
        icon: "size-10 rounded-2xl",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-xl",
        "icon-lg": "size-11 rounded-2xl",
        "icon-xl": "size-12 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: ReactNode;
  isDisabled?: boolean;
  disabled?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      loading = false,
      icon,
      isDisabled,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled || isDisabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? (
        <Loader2
          data-icon="inline-start"
          className="animate-spin"
          aria-hidden="true"
        />
      ) : (
        icon && (
          <span data-icon="inline-start" className="inline-flex">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  ),
);

Button.displayName = "Button";

interface LinkButtonProps
  extends
    AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof buttonVariants> {}

const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <a
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);

LinkButton.displayName = "LinkButton";

export { Button, LinkButton, buttonVariants };
