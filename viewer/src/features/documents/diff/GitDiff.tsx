/**
 * Two texts as a git diff, drawn by git-diff-view (MIT), the way GitHub draws one.
 *
 * Loaded only when a diff is opened: the library and its stylesheet are the
 * largest thing in the viewer, and most visits never ask for one.
 */
import { generateDiffFile } from "@git-diff-view/file";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { FileDiffIcon } from "lucide-react";
import { useMemo } from "react";
import { useIsDark } from "@/hooks/useIsDark";

export interface GitDiffProps {
  oldName: string;
  oldText: string;
  newName: string;
  newText: string;
  split: boolean;
}

export default function GitDiff({ oldName, oldText, newName, newText, split }: GitDiffProps) {
  const dark = useIsDark();
  const file = useMemo(() => {
    const diff = generateDiffFile(oldName, oldText, newName, newText, "plaintext", "plaintext");
    diff.initTheme(dark ? "dark" : "light");
    diff.init();
    diff.buildSplitDiffLines();
    diff.buildUnifiedDiffLines();
    return diff;
  }, [oldName, oldText, newName, newText, dark]);

  const same = file.additionLength === 0 && file.deletionLength === 0;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-4 py-2 font-mono text-xs">
        <FileDiffIcon className="size-4 text-muted-foreground" />
        <span className="truncate">
          {oldName} <span className="text-muted-foreground">→</span> {newName}
        </span>
        <span className="ml-auto flex gap-2 tabular-nums" aria-label="Lines changed">
          <span className="text-success">+{file.additionLength}</span>
          <span className="text-destructive">−{file.deletionLength}</span>
        </span>
      </div>
      {same ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No differences: the two read the same, line for line.
        </p>
      ) : (
        <DiffView
          diffFile={file}
          diffViewMode={split ? DiffModeEnum.Split : DiffModeEnum.Unified}
          diffViewTheme={dark ? "dark" : "light"}
          diffViewWrap
          diffViewHighlight={false}
          diffViewFontSize={13}
        />
      )}
    </div>
  );
}
