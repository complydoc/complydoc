import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** A button or link under the text, where there is something to do about it. */
  action?: ReactNode;
  className?: string;
}

/** What a place shows when it has nothing to show: a quiet icon, what is missing, and why. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Empty className={cn("gap-3 p-0 py-10", className)}>
      <EmptyHeader className="gap-1.5">
        <EmptyMedia variant="icon" className="mb-1 size-9 rounded-md border bg-muted/60 text-muted-foreground">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription className="text-xs/relaxed">{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
