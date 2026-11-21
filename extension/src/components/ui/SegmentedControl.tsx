/**
 * Accessible segmented radiogroup control (used for Avatar Size in Settings).
 *
 * @module components/ui/SegmentedControl
 */
import { Check } from "lucide-react";
import type { ReactNode } from "react";

/** Single option displayed inside {@link SegmentedControl}. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Props for {@link SegmentedControl}. */
export interface SegmentedControlProps<T extends string> {
  labelId: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Pill-shaped segmented selector exposing `role="radiogroup"` semantics.
 *
 * @param props - Options, selected value and change handler.
 */
export function SegmentedControl<T extends string>({
  labelId,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>): ReactNode {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="border-border-subtle bg-surface grid grid-cols-3 gap-1 rounded-full border p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(option.value);
            }}
            className={`flex cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 py-2 text-xs font-medium transition-colors ${
              selected
                ? "bg-accent text-accent-ink font-semibold shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
