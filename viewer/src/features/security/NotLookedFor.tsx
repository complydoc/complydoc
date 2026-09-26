import { EyeOffIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { plural } from "@/report/format";
import type { NotLookedFor as Category } from "@/report/limitations";

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
        <ul className="mt-1 flex flex-col gap-1">
          {categories.map((category) => (
            <li key={category.category}>
              <span className="font-medium text-foreground">{category.label}</span>
              {category.documents < documents && ` (${plural(category.documents, "document")})`}: {category.reason}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
