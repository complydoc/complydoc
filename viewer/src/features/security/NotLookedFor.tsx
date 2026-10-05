import { EyeOffIcon } from "lucide-react";
import { InstallCommands } from "@/components/InstallCommands";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { plural } from "@/report/format";
import { installHint } from "@/report/installHint";
import type { NotLookedFor as Category } from "@/report/limitations";

/** Categories held back for the same reason, said once: a missing name model holds back two. */
function byReason(categories: Category[]): Category[][] {
  const groups = new Map<string, Category[]>();
  for (const category of categories) groups.set(category.reason, [...(groups.get(category.reason) ?? []), category]);
  return [...groups.values()];
}

const names = (labels: string[]) =>
  labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : (labels[0] ?? "");

/**
 * The identifier categories this run could not look for. A category never scanned
 * counts no findings, which reads the same as a clean one unless it is said here,
 * above the findings it would otherwise hide among.
 */
export function NotLookedFor({ categories, documents }: { categories: Category[]; documents: number }) {
  return (
    <Alert>
      <EyeOffIcon />
      <AlertTitle>
        {categories.length === 1 ? "1 category was" : `${categories.length} categories were`} not looked for
      </AlertTitle>
      <AlertDescription>
        <p>Finding none of these means nothing was searched for, not that the documents are clean of them.</p>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {byReason(categories).map((group) => {
            const hint = installHint(group[0]?.reason ?? "");
            const reach = Math.max(...group.map((c) => c.documents));
            return (
              <li key={group[0]?.category} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">{names(group.map((c) => c.label))}</span>
                {reach < documents && <span>({plural(reach, "document")})</span>}
                <span>{hint.summary}</span>
                <InstallCommands hint={hint} />
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
