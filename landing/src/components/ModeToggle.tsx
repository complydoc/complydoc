import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ModeToggleProps {
  /** Whether the dark theme is showing. */
  dark: boolean;
  onToggle: () => void;
}

/** shadcn's mode toggle: one button, showing the theme in use; a click switches to the other. */
export function ModeToggle({ dark, onToggle }: ModeToggleProps) {
  const label = dark ? "Switch to the light theme" : "Switch to the dark theme";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={label}>
          {dark ? <MoonIcon /> : <SunIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
