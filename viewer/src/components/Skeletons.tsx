import { Skeleton } from "@/components/ui/skeleton";

/** Line widths that read as text, the same every time so nothing shimmers into a new shape. */
const LINES = ["92%", "78%", "88%", "64%", "95%", "71%", "84%", "58%", "90%", "76%", "82%", "67%"];

/** A table's rows as they will sit, while the table is on its way. */
function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex h-10 items-center gap-6 border-b px-4">
        {["w-24", "w-16", "w-14", "w-20"].map((width) => (
          <Skeleton key={width} className={`h-3 ${width}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-11 items-center gap-4 border-b px-4 last:border-b-0">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${30 + ((index * 17) % 30)}%` }} />
          <Skeleton className="ml-auto h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * The viewer's own shape while `complydoc ui` hands over the reports: the sidebar, the
 * header and a table, the way Linear holds a view's place before its items arrive.
 */
export function ShellSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <aside className="hidden w-64 shrink-0 flex-col gap-6 p-4 md:flex">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex flex-col gap-3">
          {["w-20", "w-24", "w-16", "w-24", "w-20", "w-14"].map((width, index) => (
            <Skeleton key={index} className={`h-3.5 ${width}`} />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-3 border-b px-4">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-6 w-56" />
          <RowsSkeleton rows={8} />
        </div>
      </div>
    </div>
  );
}

/** A document on its way: its toolbar and lines of text where the page will be. */
export function DocumentSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Opening the document">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="ml-auto h-8 w-40 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2.5 rounded-xl border bg-card p-6">
        {LINES.concat(LINES).map((width, index) => (
          <Skeleton key={index} className="h-3" style={{ width }} />
        ))}
      </div>
    </div>
  );
}
