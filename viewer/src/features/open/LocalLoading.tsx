import { Logo } from "@/components/Logo";

/** While `complydoc ui` hands over the reports it found. */
export function LocalLoading({ sources }: { sources: string[] }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4" aria-busy="true">
      <Logo size={36} />
      <p className="text-sm text-muted-foreground">
        Opening the reports in <code className="font-mono">{sources.join(", ") || ".complydoc"}</code>
      </p>
    </main>
  );
}
