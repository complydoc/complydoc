import { CoinsIcon, FileDiffIcon, FileTextIcon, ShieldAlertIcon, WorkflowIcon } from "lucide-react";
import costDark from "@/assets/screens/cost-dark.webp";
import costLight from "@/assets/screens/cost-light.webp";
import diffDark from "@/assets/screens/diff-dark.webp";
import diffLight from "@/assets/screens/diff-light.webp";
import documentDark from "@/assets/screens/document-dark.webp";
import documentLight from "@/assets/screens/document-light.webp";
import securityDark from "@/assets/screens/security-dark.webp";
import securityLight from "@/assets/screens/security-light.webp";
import traceDark from "@/assets/screens/trace-dark.webp";
import traceLight from "@/assets/screens/trace-light.webp";
import { Screenshot } from "@/components/Screenshot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { links } from "@/links";

const VIEWS = [
  {
    value: "trace",
    label: "Trace",
    icon: WorkflowIcon,
    src: { dark: traceDark, light: traceLight },
    alt: "The viewer's trace of an ingestion pipeline: every call in a tree with its time, tokens and identifiers, and the embedding call's input and output",
    caption:
      "Every call your pipeline made, the files each loader read beneath it, with time, tokens, cost and the identifiers it passed on. Here the embedding model was sent text holding 34 of them.",
  },
  {
    value: "document",
    label: "Document",
    icon: FileTextIcon,
    src: { dark: documentDark, light: documentLight },
    alt: "The viewer's document view: every page with numbered lines, a splitter's chunks drawn over the text, and the findings listed beside it",
    caption:
      "A document as your pipeline read it, a splitter's chunks drawn over the text, and each finding opened in place with the line it sits in.",
  },
  {
    value: "diff",
    label: "Diff",
    icon: FileDiffIcon,
    src: { dark: diffDark, light: diffLight },
    alt: "The viewer's diff of two readings of the same document, with added and lost lines marked",
    caption: "Two readers of the same document, side by side or unified: what one loader keeps that another drops.",
  },
  {
    value: "security",
    label: "Security",
    icon: ShieldAlertIcon,
    src: { dark: securityDark, light: securityLight },
    alt: "The viewer's Security page: identifiers found by severity, kind and document, and hidden instructions",
    caption: "Personal and financial identifiers, and hidden instructions, by kind and by document, each linked to its page.",
  },
  {
    value: "cost",
    label: "Cost & time",
    icon: CoinsIcon,
    src: { dark: costDark, light: costLight },
    alt: "The viewer's Cost and time page: the price of reading the folder on every model, grouped by provider",
    caption: "What reading the documents costs and takes on every model, from the text layer or as page images.",
  },
];

/** The viewer, one page at a time, in the theme the reader has. The screenshots are of the demo run on the sample documents. */
export function ProductTour({ className }: { className?: string }) {
  return (
    <Tabs defaultValue="trace" className={className}>
      <TabsList variant="line" className="mx-auto">
        {VIEWS.map((view) => (
          <TabsTrigger key={view.value} value={view.value}>
            <view.icon />
            {view.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {VIEWS.map((view) => (
        <TabsContent key={view.value} value={view.value} className="mt-4 flex flex-col gap-4">
          <Screenshot src={view.src} alt={view.alt} />
          <p className="text-center text-sm text-muted-foreground">{view.caption}</p>
        </TabsContent>
      ))}
      <p className="text-center text-sm">
        Every view opens on your own reports with{" "}
        <a href={links.viewerGuide} className="font-mono underline underline-offset-4">
          complydoc ui
        </a>
        , served from your machine.
      </p>
    </Tabs>
  );
}
