import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Lang } from "@/lib/highlight";
import { Code } from "./CodeBlock";
import { CopyButton } from "./CopyButton";

export interface CodeTab {
  value: string;
  label: string;
  icon?: ReactNode;
  lang: Lang;
  code: string;
  /** A line under the code saying what it does. */
  note?: ReactNode;
}

/** Several snippets in one panel, one tab each, with the copy button for the tab showing. */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(tabs[0]?.value ?? "");
  const current = tabs.find((tab) => tab.value === active);

  return (
    <Tabs value={active} onValueChange={setActive} className="gap-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 pr-2">
        <TabsList variant="line" className="h-11 flex-1 justify-start overflow-x-auto px-2">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-2.5">
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {current && <CopyButton text={current.code} label={`Copy the ${current.label} example`} />}
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <Code code={tab.code} lang={tab.lang} />
          {tab.note && <p className="border-t px-4 py-3 text-sm text-muted-foreground">{tab.note}</p>}
        </TabsContent>
      ))}
    </Tabs>
  );
}
