import { LockIcon } from "lucide-react";
import { Hint } from "@/components/Hint";
import { Badge } from "@/components/ui/badge";
import { servedReadOnly } from "@/hooks/useLocalReports";

/**
 * Shown when `complydoc ui` serves the viewer read-only, as it does for a team: why the
 * controls that change the ignore, concepts and categories files are not here.
 */
export function ReadOnlyBadge() {
  if (!servedReadOnly()) return null;
  return (
    <Hint label="This viewer changes no file. What you ignore here lasts while the page is open.">
      <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
        <LockIcon aria-hidden="true" />
        Read-only
      </Badge>
    </Hint>
  );
}
