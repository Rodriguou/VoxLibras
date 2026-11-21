/**
 * Accessible dark-mode button primitive.
 *
 * @module components/ui/Button
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Visual style variants supported by {@link Button}. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Props for {@link Button}. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink font-semibold hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50",
  secondary:
    "bg-card text-text-primary border border-border-subtle font-medium hover:bg-card-elevated disabled:opacity-50",
  ghost:
    "bg-transparent text-text-muted hover:text-text-primary hover:bg-card-elevated disabled:opacity-50",
  danger:
    "bg-danger/15 text-red-300 border border-danger/40 font-medium hover:bg-danger/25 disabled:opacity-50",
};

/**
 * Reusable button aligned with the VoxLibras dark palette and WCAG focus rings.
 *
 * @param props - Button attributes and visual variant.
 */
export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
