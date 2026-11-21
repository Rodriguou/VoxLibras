/**
 * Accessible dark-mode select dropdown primitive.
 *
 * @module components/ui/Select
 */
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** Single option for {@link Select}. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Props for {@link Select}. */
export interface SelectProps<T extends string> {
  id: string;
  labelId: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Native `<select>` styled to match the VoxLibras dark cards while preserving full keyboard UX.
 *
 * @param props - Options, selected value and change handler.
 */
export function Select<T extends string>({
  id,
  labelId,
  options,
  value,
  onChange,
}: SelectProps<T>): ReactNode {
  return (
    <div className="relative">
      <select
        id={id}
        aria-labelledby={labelId}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value as T);
        }}
        className="border-border-subtle bg-surface text-text-primary hover:border-text-muted/50 w-full cursor-pointer appearance-none rounded-xl border px-3.5 py-2.5 pr-9 text-sm font-medium transition-colors"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-card text-text-primary">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="text-text-muted pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
  );
}
