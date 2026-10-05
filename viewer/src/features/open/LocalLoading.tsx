import { ShellSkeleton } from "@/components/Skeletons";

/** While `complydoc ui` hands over the reports it found: the viewer's shape, waiting for them. */
export function LocalLoading({ sources }: { sources: string[] }) {
  return <ShellSkeleton label={`Opening the reports in ${sources.join(", ") || ".complydoc"}`} />;
}
