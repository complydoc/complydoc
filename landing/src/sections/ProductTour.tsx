import { CoinsIcon, FileDiffIcon, FilesIcon, ShieldAlertIcon } from "lucide-react";
import cost from "@/assets/screens/cost.webp";
import diff from "@/assets/screens/diff.webp";
import pages from "@/assets/screens/pages.webp";
import security from "@/assets/screens/security.webp";
import { Screenshot } from "@/components/Screenshot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VIEWS = [
  {
    value: "diff",
    label: "Diff",
    icon: FileDiffIcon,
    src: diff,
    alt: "The viewer's Diff view: pdfplumber's reading of the annual report beside pypdf's, split, with added and lost lines marked",
    caption: "Any two readings of a document, split or unified, by sentence or by line as read. pypdf adds a running header that pdfplumber drops.",
  },
  {
    value: "pages",
    label: "Pages",
    icon: FilesIcon,
    src: pages,
    alt: "The viewer's page comparison: the page image with identifiers boxed, beside the pdfplumber and pypdf readings",
    caption: "The page itself, identifiers boxed where they sit, beside every reading of it, with what each one costs.",
  },
  {
    value: "cost",
    label: "Cost & time",
    icon: CoinsIcon,
    src: cost,
    alt: "The viewer's Cost and time page: the price per 1,000 documents for every model, grouped by provider",
    caption: "Every model priced on your documents, per provider, as text, as images, or routed page by page.",
  },
  {
    value: "security",
    label: "Security",
    icon: ShieldAlertIcon,
    src: security,
    alt: "The viewer's Security page: a hidden instruction in white text, and every identifier found, masked, with its severity and confidence",
    caption: "Hidden instructions quoted with why they were flagged, and every identifier, masked, linked to its page.",
  },
];

/** The viewer, one page at a time. The screenshots are of the sample report. */
export function ProductTour({ className }: { className?: string }) {
  return (
    <Tabs defaultValue="diff" className={className}>
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
    </Tabs>
  );
}
