import { useCallback, useMemo, useState } from "react";
import type { Selection } from "@/components/CollectionSwitcher";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OpenReport } from "@/features/open/OpenReport";
import { LocalLoading } from "@/features/open/LocalLoading";
import { SAMPLES } from "@/features/open/samples";
import { useLocalReports } from "@/hooks/useLocalReports";
import { embeddedReports, useReports } from "@/hooks/useReports";
import { useTheme } from "@/hooks/useTheme";
import { collectionsOf } from "@/report/collections";
import { ReportView } from "./ReportView";

/** Shows the open reports, or the way to open some. */
export function App() {
  const { dark, toggle } = useTheme();
  const { state, addTexts, addFiles, closeAll } = useReports(embeddedReports);
  const local = useLocalReports(addTexts);
  const collections = useMemo(() => collectionsOf(state.loaded), [state.loaded]);
  const [chosen, setChosen] = useState<Selection | null>(null);

  // One folder open goes straight to it; several open on the overview, until one is chosen.
  const selection: Selection =
    chosen && (chosen.collection === null || collections.some((c) => c.id === chosen.collection))
      ? chosen
      : collections.length === 1
        ? { collection: collections[0]?.id ?? null, run: collections[0]?.runs[0]?.id ?? null }
        : { collection: null, run: null };

  const openSamples = useCallback(
    async (ids: string[]) => {
      const samples = SAMPLES.filter((s) => ids.includes(s.id));
      addTexts(await Promise.all(samples.map(async (s) => ({ name: `sample: ${s.label}`, text: await s.load() }))));
    },
    [addTexts],
  );

  const close = useCallback(() => {
    setChosen(null);
    closeAll();
  }, [closeAll]);

  return (
    <TooltipProvider>
      {local.status === "loading" && state.loaded.length === 0 ? (
        <LocalLoading sources={local.sources} />
      ) : state.loaded.length > 0 ? (
        <ReportView
          collections={collections}
          selection={selection}
          onSelect={setChosen}
          onAdd={(files) => void addFiles(files)}
          onCloseAll={close}
          dark={dark}
          onToggleTheme={toggle}
        />
      ) : (
        <OpenReport
          dark={dark}
          onToggleTheme={toggle}
          onFiles={(files) => void addFiles(files)}
          onSamples={(ids) => void openSamples(ids)}
          error={[local.error, ...state.errors].filter(Boolean).join(" ") || undefined}
          local={local}
        />
      )}
    </TooltipProvider>
  );
}
