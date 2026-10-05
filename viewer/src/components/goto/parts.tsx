import { Command as CommandPrimitive } from "cmdk";
import { CornerDownLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Keys } from "@/components/Keys";
import { cn } from "@/lib/utils";

/** One thing the menu can open or do: an icon, its name, and what is said at the row's end. */
export function Row({
  value,
  onSelect,
  icon,
  children,
  aside,
}: {
  value: string;
  onSelect: () => void;
  icon: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className="group/row flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] outline-none select-none data-[selected=true]:bg-muted [&_svg]:shrink-0 [&>svg]:size-[18px] [&>svg]:text-muted-foreground"
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      <span className="ml-auto flex shrink-0 items-center gap-3 pl-4 text-xs text-muted-foreground">
        {aside}
        {/* The row Enter would open says so, as the menu's foot does. */}
        <CornerDownLeftIcon
          className="size-4 opacity-0 group-data-[selected=true]/row:opacity-100"
          aria-hidden="true"
        />
      </span>
    </CommandPrimitive.Item>
  );
}

/** A named section of rows. */
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className="pb-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </CommandPrimitive.Group>
  );
}

/** One of the kinds of thing the menu holds, to show only that kind. */
export function TypeTab({ active, onPick, children }: { active: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      // The search keeps the keyboard: the tabs are changed with the arrows.
      tabIndex={-1}
      onClick={onPick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm transition-colors",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** What a key does in the menu, at its foot. */
export function FootKey({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <Keys keys={keys} />
    </span>
  );
}
