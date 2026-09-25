import { useEffect, useState, type ReactNode } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { highlight, type Lang } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

/** Highlighted code, shown plain until Shiki has loaded. */
export function Code({ code, lang }: { code: string; lang: Lang }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    highlight(code, lang).then(
      (result) => live && setHtml(result),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [code, lang]);

  return (
    <ScrollArea className="w-full">
      {html ? (
        <div className="code p-4" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="code p-4">
          <code>{code}</code>
        </pre>
      )}
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

interface CodeBlockProps {
  code: string;
  lang: Lang;
  /** A file name or command, shown in the bar above the code. */
  title: string;
  /** Something before the title, such as a logo. */
  icon?: ReactNode;
  /** Leave out the copy button, for output rather than code. */
  output?: boolean;
  className?: string | undefined;
}

/** A block of code in a bordered panel, with its name and a copy button: shadcn's code block, composed. */
export function CodeBlock({ code, lang, title, icon, output = false, className }: CodeBlockProps) {
  return (
    <figure data-slot="code-block" className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <figcaption className="flex h-10 items-center gap-2 border-b bg-muted/40 px-3 text-xs text-muted-foreground">
        {icon}
        <span className="truncate font-mono">{title}</span>
        {!output && (
          <span className="ml-auto">
            <CopyButton text={code} label={`Copy ${title}`} />
          </span>
        )}
      </figcaption>
      <Code code={code} lang={lang} />
    </figure>
  );
}
