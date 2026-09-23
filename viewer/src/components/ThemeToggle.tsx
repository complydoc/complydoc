import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Theme } from "@/hooks/useTheme";

const OPTIONS = [
  { value: "system", label: "Match the system", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

interface ThemeToggleProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

/** System, light or dark. */
export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={theme}
      aria-label="Theme"
      // Radix sends an empty value when the pressed item is pressed again; keep the choice.
      onValueChange={(value) => value && onChange(value as Theme)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label}>
          <Icon />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
