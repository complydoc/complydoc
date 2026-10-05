import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { InstallHint } from "@/report/installHint";

/** One command to copy, saying so for a moment once it is copied. */
function CopyCommand({ tool, command }: { tool: string; command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Button
      variant="outline"
      size="xs"
      className="font-mono"
      title={command}
      aria-label={`Copy the ${tool} install command`}
      onClick={copy}
    >
      {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      {copied ? "Copied" : tool}
    </Button>
  );
}

/** The commands that install what a hint says is missing, each a button that copies it. */
export function InstallCommands({ hint }: { hint: InstallHint }) {
  if (!hint.pip && !hint.uv) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {hint.pip && <CopyCommand tool="pip" command={hint.pip} />}
      {hint.uv && <CopyCommand tool="uv" command={hint.uv} />}
    </span>
  );
}
