/**
 * Range slider styled for dark mode (used for Signing Speed in Settings).
 *
 * @module components/ui/Slider
 */
import type { ReactNode } from "react";

/** Props for {@link Slider}. */
export interface SliderProps {
  id: string;
  labelId: string;
  min: number;
  max: number;
  step: number;
  value: number;
  minLabel: string;
  maxLabel: string;
  formattedValue: string;
  onChange: (value: number) => void;
}

/**
 * Accessible numeric range input with min/max labels and current value readout.
 *
 * @param props - Slider bounds, current value and change handler.
 */
export function Slider({
  id,
  labelId,
  min,
  max,
  step,
  value,
  minLabel,
  maxLabel,
  formattedValue,
  onChange,
}: SliderProps): ReactNode {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <span className="text-text-muted text-xs">{minLabel}</span>
        <input
          id={id}
          type="range"
          aria-labelledby={labelId}
          aria-valuetext={formattedValue}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            onChange(Number(event.currentTarget.value));
          }}
          style={{
            background: `linear-gradient(to right, #2dd4bf 0%, #2dd4bf ${String(percent)}%, #111214 ${String(percent)}%, #111214 100%)`,
          }}
          className="border-border-subtle accent-accent h-2.5 w-full cursor-pointer appearance-none rounded-full border"
        />
        <span className="text-text-muted text-xs">{maxLabel}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">Valor atual</span>
        <span className="text-text-primary font-semibold">{formattedValue}</span>
      </div>
    </div>
  );
}
