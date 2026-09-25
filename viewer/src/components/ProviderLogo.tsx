import anthropic from "@/assets/providers/anthropic.svg?raw";
import deepseek from "@/assets/providers/deepseek.svg?raw";
import google from "@/assets/providers/google.svg?raw";
import mistral from "@/assets/providers/mistral.svg?raw";
import moonshot from "@/assets/providers/moonshotai.svg?raw";
import openai from "@/assets/providers/openai.svg?raw";
import xai from "@/assets/providers/xai.svg?raw";
import zai from "@/assets/providers/zai.svg?raw";
import { cn } from "@/lib/utils";
import { providerColour, providerName } from "@/report/cost";

/**
 * Each provider's own mark, keyed by the provider name complydoc uses.
 *
 * The SVGs are the ones models.dev publishes, bundled rather than fetched: a
 * report viewer that called a third party every time it opened would say who
 * was reading which report. They draw in `currentColor`, so they follow the theme.
 */
const LOGOS: Record<string, string> = {
  anthropic,
  deepseek,
  gemini: google,
  google,
  mistral,
  moonshot,
  openai,
  xai,
  zai,
};

/** A provider's logo, or its chart colour where there is no logo for it. */
export function ProviderLogo({ provider, className }: { provider: string; className?: string | undefined }) {
  const svg = LOGOS[provider];
  if (!svg) {
    return (
      <span
        role="img"
        aria-label={providerName(provider)}
        className={cn("inline-block size-2 shrink-0 rounded-full", className)}
        style={{ background: providerColour(provider) }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={providerName(provider)}
      className={cn("inline-flex size-4 shrink-0 [&>svg]:size-full", className)}
      // Our own bundled files, not report content.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
