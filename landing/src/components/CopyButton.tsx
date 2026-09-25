import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Copies `text`, and shows a tick for a moment after. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" onClick={copy} aria-label={label}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}
