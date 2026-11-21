/**
 * Avatar preferences screen (size, signing speed, screen corner, restore defaults).
 *
 * Changes are applied immediately to storage and reflected live on any active overlay.
 *
 * @module features/settings/SettingsScreen
 */
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "../../components/ui/Button";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Select } from "../../components/ui/Select";
import { Slider } from "../../components/ui/Slider";
import {
  AVATAR_POSITION_LABELS,
  AVATAR_POSITIONS,
  AVATAR_SIZE_LABELS,
  AVATAR_SIZES,
  type AvatarSettings,
  DEFAULT_AVATAR_SETTINGS,
  formatSpeed,
  normalizeSpeed,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
} from "../../shared/settings";

/** Props for {@link SettingsScreen}. */
export interface SettingsScreenProps {
  settings: AvatarSettings;
  onChange: (next: AvatarSettings) => void;
  onBack: () => void;
}

const SIZE_OPTIONS = AVATAR_SIZES.map((size) => ({
  value: size,
  label: AVATAR_SIZE_LABELS[size],
}));

const POSITION_OPTIONS = AVATAR_POSITIONS.map((position) => ({
  value: position,
  label: AVATAR_POSITION_LABELS[position],
}));

/**
 * Avatar customization screen (size, signing speed, screen corner, and restore defaults).
 *
 * @param props - Current settings, change handler and back navigation callback.
 */
export function SettingsScreen({ settings, onChange, onBack }: SettingsScreenProps): ReactNode {
  const [restoredNotice, setRestoredNotice] = useState(false);

  useEffect(() => {
    if (!restoredNotice) {
      return;
    }
    const timer = setTimeout(() => {
      setRestoredNotice(false);
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [restoredNotice]);

  return (
    <div className="bg-surface text-text-primary flex min-h-[460px] flex-col">
      <header className="border-border-subtle flex items-center gap-3 border-b px-4 py-3.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="border-border-subtle bg-card text-text-primary hover:bg-card-elevated flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h1 className="text-base font-bold">Configurações do Avatar</h1>
      </header>

      <main className="flex-1 space-y-3.5 p-4">
        <section className="border-border-subtle bg-card space-y-2.5 rounded-2xl border p-3.5">
          <h2 id="avatar-size-label" className="text-text-primary text-xs font-semibold">
            Tamanho do Avatar
          </h2>
          <SegmentedControl
            labelId="avatar-size-label"
            options={SIZE_OPTIONS}
            value={settings.size}
            onChange={(size) => {
              onChange({ ...settings, size });
            }}
          />
        </section>

        <section className="border-border-subtle bg-card space-y-2.5 rounded-2xl border p-3.5">
          <label
            htmlFor="avatar-speed-slider"
            id="avatar-speed-label"
            className="text-text-primary block text-xs font-semibold"
          >
            Velocidade da Sinalização
          </label>
          <Slider
            id="avatar-speed-slider"
            labelId="avatar-speed-label"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={settings.speed}
            minLabel={formatSpeed(SPEED_MIN)}
            maxLabel={formatSpeed(SPEED_MAX)}
            formattedValue={formatSpeed(settings.speed)}
            onChange={(raw) => {
              onChange({ ...settings, speed: normalizeSpeed(raw) });
            }}
          />
        </section>

        <section className="border-border-subtle bg-card space-y-2.5 rounded-2xl border p-3.5">
          <label
            htmlFor="avatar-position-select"
            id="avatar-position-label"
            className="text-text-primary block text-xs font-semibold"
          >
            Posição na Tela
          </label>
          <Select
            id="avatar-position-select"
            labelId="avatar-position-label"
            options={POSITION_OPTIONS}
            value={settings.position}
            onChange={(position) => {
              onChange({ ...settings, position });
            }}
          />
        </section>
      </main>

      <footer className="border-border-subtle space-y-2 border-t p-4">
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            onChange({ ...DEFAULT_AVATAR_SETTINGS });
            setRestoredNotice(true);
          }}
        >
          Restaurar Padrões
        </Button>
        <p role="status" aria-live="polite" className="text-accent min-h-4 text-center text-xs">
          {restoredNotice ? "Padrões restaurados." : ""}
        </p>
      </footer>
    </div>
  );
}
