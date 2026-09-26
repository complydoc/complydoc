import { screen, within } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { sampleAudit, sampleRunOf, sampleVerified } from "@/test/sample";
import { attentionDocuments, topFindings } from "@/report/home";
import { HomePage } from "./HomePage";

describe("Home", () => {
  it("leads with figures that each open what they count", () => {
    renderPage(<HomePage report={sampleAudit()} />);
    expect(screen.getByRole("link", { name: /^Documents/ })).toHaveAttribute("href", "#documents");
    expect(screen.getByRole("link", { name: /High-severity identifiers/ })).toHaveAttribute("href", "#security");
    expect(screen.getByRole("link", { name: /To read it all/ })).toHaveAttribute("href", "#cost");
  });

  it("lists the surest high-severity findings, each opening its page", () => {
    const report = sampleAudit();
    renderPage(<HomePage report={report} />);
    const card = screen.getByText("Needs attention").closest("[data-slot=card]") as HTMLElement;
    const links = within(card).getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("#documents/"));
    expect(links.length).toBe(topFindings(report).rows.length);
    expect(links[0]).toHaveAttribute("href", expect.stringMatching(/^#documents\/\d+\/\d+\/i\d+$/));
    expect(within(card).getAllByRole("button", { name: /how this was validated/ })[0]).toHaveTextContent("Certain");
  });

  it("names the documents to look at first, with why", () => {
    renderPage(<HomePage report={sampleAudit()} />);
    const card = screen.getByText("Documents to look at").closest("[data-slot=card]") as HTMLElement;
    expect(within(card).getByRole("link", { name: "vendor-due-diligence.pdf" })).toBeInTheDocument();
    expect(within(card).getByText("hidden instruction")).toBeInTheDocument();
  });

  it("drops the sections that had no business here", () => {
    renderPage(<HomePage report={sampleAudit()} />);
    for (const gone of ["Quick wins", "In numbers", "Find out more"]) {
      expect(screen.queryByRole("region", { name: gone })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/notes? on what this run could not check/)).not.toBeInTheDocument();
  });
});

describe("Home for a run of some components", () => {
  it("says what a pricing run did not measure, and shows what it did", () => {
    renderPage(<HomePage report={sampleRunOf(["cost"])} />);
    expect(screen.getAllByText("not in this run")).toHaveLength(2);
    expect(screen.getByText("No identifier scan in this run")).toBeInTheDocument();
    expect(screen.getByText("Readiness was not measured in this run")).toBeInTheDocument();
    expect(screen.queryByText("No pricing in this run")).not.toBeInTheDocument();
    expect(screen.getByText(/^complydoc sensitive /)).toBeInTheDocument();
  });

  it("says what a scan did not price", () => {
    renderPage(<HomePage report={sampleRunOf(["sensitive"])} />);
    expect(screen.getByText("No pricing in this run")).toBeInTheDocument();
    expect(screen.queryByText("No identifier scan in this run")).not.toBeInTheDocument();
  });
});

describe("what Home points at", () => {
  it("puts a hidden instruction above everything else", () => {
    const [first] = attentionDocuments(sampleAudit());
    expect(first?.path).toMatch(/vendor-due-diligence\.pdf$/);
    expect(first?.reasons[0]).toEqual({ label: "hidden instruction", tone: "bad" });
  });

  it("names a page a vision model disputed", () => {
    const rows = attentionDocuments(sampleVerified());
    expect(rows.some((row) => row.reasons.some((r) => r.label.startsWith("vision disputes")))).toBe(true);
  });

  it("counts high-severity findings, and those proved by a check", () => {
    const { high, confirmedHigh, rows } = topFindings(sampleAudit());
    expect(high).toBeGreaterThan(0);
    expect(confirmedHigh).toBeLessThanOrEqual(high);
    expect(rows.every((row) => row.severity === "high")).toBe(true);
  });
});
