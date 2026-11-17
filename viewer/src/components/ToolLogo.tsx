import { FileTextIcon, ScanTextIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ProviderLogo } from "@/components/ProviderLogo";
import { cn } from "@/lib/utils";
import { MARKS, PROVIDERS } from "./toolMarks";

/** The mark alone, hidden from assistive technology: the name beside it says what it is. */
export function ToolLogo({ name, className }: { name: string; className?: string | undefined }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center">
      <Mark name={name} className={className} />
    </span>
  );
}

function Mark({ name, className }: { name: string; className?: string | undefined }) {
  const size = cn("size-3.5 shrink-0", className);
  if (/^complydoc\b/i.test(name)) return <Logo withName={false} size={11} />;
  const provider = PROVIDERS.find(([pattern]) => pattern.test(name));
  if (provider) return <ProviderLogo provider={provider[1]} className={size} />;
  const mark = MARKS.find(([pattern]) => pattern.test(name));
  if (mark) return <img src={mark[1]} alt="" aria-hidden="true" className={cn(size, "object-contain")} />;
  if (/ocr|tesseract/i.test(name)) return <ScanTextIcon aria-hidden="true" className={cn(size, "text-muted-foreground")} />;
  return <FileTextIcon aria-hidden="true" className={cn(size, "text-muted-foreground")} />;
}

/** A reader's name with its mark before it. */
export function ToolName({ name, className }: { name: string; className?: string | undefined }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <ToolLogo name={name} />
      <span className="truncate">{name}</span>
    </span>
  );
}
