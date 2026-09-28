import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { collectionsOf } from "@/report/collections";
import { sampleAudit } from "@/test/sample";
import { traceReport } from "@/test/trace";
import { OverviewPage } from "./OverviewPage";

describe("OverviewPage", () => {
  it("lists a pipeline apart from the folders, and counts only the folders' documents", () => {
    const audit = sampleAudit();
    const collections = collectionsOf([
      { id: "audit", name: "audit.json", report: audit },
      { id: "trace", name: "trace.json", report: traceReport() },
    ]);
    render(<OverviewPage collections={collections} onOpen={() => {}} />);

    const folders = screen.getByRole("table", { name: "Folders" });
    expect(within(folders).getAllByRole("row")).toHaveLength(2);
    const pipelines = screen.getByRole("table", { name: "Pipelines" });
    expect(within(pipelines).getByText("contracts-ingest")).toBeInTheDocument();
    // The folders stat: one folder, holding the audit's documents and no others.
    expect(screen.getByText(`${audit.documents.length} documents`)).toBeInTheDocument();
  });
});
