/**
 * First-run onboarding carousel shown once after extension installation.
 *
 * @module features/onboarding/OnboardingScreen
 */
import { Accessibility, ArrowLeft, Play, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "../../components/ui/Button";

interface OnboardingSlide {
  title: string;
  description: string;
  icon: "accessibility" | "how" | "privacy";
}

const SLIDES: readonly OnboardingSlide[] = [
  {
    icon: "accessibility",
    title: "Tradução em tempo real para Libras",
    description: "Transforme o áudio do navegador em Libras. Vamos começar juntos.",
  },
  {
    icon: "how",
    title: "Como funciona",
    description:
      "Abra qualquer vídeo no navegador, clique em Ativar Tradução e acompanhe o avatar 3D sobre a tela.",
  },
  {
    icon: "privacy",
    title: "Privacidade garantida",
    description:
      "O áudio é processado em memória em tempo real e descartado imediatamente. Nada é gravado ou salvo.",
  },
];

/** Props for {@link OnboardingScreen}. */
export interface OnboardingScreenProps {
  onComplete: () => void;
}

function SlideIcon({ kind }: { kind: OnboardingSlide["icon"] }): ReactNode {
  switch (kind) {
    case "accessibility":
      return <Accessibility className="text-accent-ink h-9 w-9" aria-hidden="true" />;
    case "how":
      return <Play className="text-accent-ink h-8 w-8 fill-current" aria-hidden="true" />;
    case "privacy":
      return <ShieldCheck className="text-accent-ink h-9 w-9" aria-hidden="true" />;
  }
}

/**
 * Three-step dark-mode onboarding explaining purpose, usage and volatile privacy guarantees.
 *
 * @param props - Completion callback invoked when the user clicks "Começar" or "Pular".
 */
export function OnboardingScreen({ onComplete }: OnboardingScreenProps): ReactNode {
  const [step, setStep] = useState(0);
  const current = SLIDES[step] ?? SLIDES[0];
  const isLast = step === SLIDES.length - 1;

  if (!current) {
    return null;
  }

  return (
    <div className="bg-surface text-text-primary flex min-h-[460px] flex-col">
      <header className="border-border-subtle flex items-center justify-between border-b px-5 py-3.5">
        <h1 className="text-sm font-semibold">Boas-vindas</h1>
        {!isLast ? (
          <button
            type="button"
            onClick={onComplete}
            className="text-text-muted hover:text-text-primary cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors"
          >
            Pular
          </button>
        ) : null}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <div className="border-border-subtle bg-card mb-7 flex h-28 w-28 items-center justify-center rounded-3xl border">
          <div className="bg-accent shadow-accent/20 flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
            <SlideIcon kind={current.icon} />
          </div>
        </div>

        <h2 className="mb-3 text-xl leading-snug font-bold tracking-tight">{current.title}</h2>
        <p className="text-text-muted max-w-[260px] text-sm leading-relaxed">
          {current.description}
        </p>
      </main>

      <footer className="border-border-subtle space-y-4 border-t px-5 py-4">
        <div className="flex items-center justify-center gap-2" aria-label="Progresso">
          {SLIDES.map((slide, index) => {
            const active = index === step;
            return (
              <button
                key={slide.title}
                type="button"
                aria-label={`Etapa ${String(index + 1)} de ${String(SLIDES.length)}: ${slide.title}`}
                aria-current={active ? "step" : undefined}
                onClick={() => {
                  setStep(index);
                }}
                className={`h-2 cursor-pointer rounded-full transition-all ${
                  active ? "bg-accent w-5" : "bg-border-subtle hover:bg-text-muted w-2"
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {step > 0 ? (
            <Button
              variant="secondary"
              aria-label="Etapa anterior"
              onClick={() => {
                setStep((prev) => Math.max(0, prev - 1));
              }}
              className="px-3"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}

          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              if (isLast) {
                onComplete();
              } else {
                setStep((prev) => Math.min(SLIDES.length - 1, prev + 1));
              }
            }}
          >
            {isLast ? "Começar" : "Próximo"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
