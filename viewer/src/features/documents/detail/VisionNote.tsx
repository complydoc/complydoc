import { EyeIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatPercent } from "@/report/format";
import type { PageVerification } from "@/report/types";

const TITLE: Record<PageVerification["status"], string> = {
  agrees: "The vision read agrees",
  disagrees: "A vision model read words on this page that the kept reading lacks",
  filled: "Only the vision model could read this page, so its reading was kept",
  failed: "The vision model could not read this page",
  not_rendered: "This page could not be drawn for a vision model",
};

/** What the vision check made of the page on screen, above its readings. */
export function VisionNote({ page, model }: { page: PageVerification; model: string }) {
  return (
    <Alert role="note">
      <EyeIcon />
      <AlertTitle>{TITLE[page.status]}</AlertTitle>
      <AlertDescription>
        {page.missing && <p>“{page.missing}”</p>}
        {page.error && <p>{page.error}</p>}
        <p>
          {model}
          {page.coverage !== null && ` · ${formatPercent(page.coverage)} of its words are in the kept reading`}
          {` · checked because ${page.why}`}
        </p>
      </AlertDescription>
    </Alert>
  );
}
