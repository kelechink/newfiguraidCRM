import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.16),0_1px_2px_hsl(var(--shadow)/0.2)] hover:bg-accent/90 active:bg-accent",
  secondary: "bg-surface text-ink border border-line shadow-card hover:bg-surface-2 hover:border-line-strong",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 gap-1.5 text-[12.5px]",
  md: "h-8 px-3 gap-2 text-[13px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-[7px] font-medium transition-[background,border,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
});
