import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleAudit } from "@/test/sample";
import { SecurityPage } from "./SecurityPage";

describe("SecurityPage", () => {
  it("counts by severity, and the hidden instructions", () => {
    render(<SecurityPage report={sampleAudit()} />);
    const found = screen.getByRole("region", { name: "Found" });
    expect(within(found).getByText("High severity").nextElementSibling).toHaveTextContent(/\d+/);
    expect(within(found).getByText("Hidden instructions").nextElementSibling).toHaveTextContent("1");
  });

  it("charts what was found and where, side by side", () => {
    render(<SecurityPage report={sampleAudit()} />);
    const charts = screen.getByRole("region", { name: "What and where" });
    expect(within(charts).getByText("By kind")).toBeInTheDocument();
    expect(within(charts).getByText("By document")).toBeInTheDocument();
  });

  it("quotes each hidden instruction with where it is and why it was flagged", () => {
    render(<SecurityPage report={sampleAudit()} />);
    const hidden = screen.getByRole("list", { name: "Hidden instructions" });
    expect(within(hidden).getAllByRole("listitem")).toHaveLength(1);
    expect(within(hidden).getAllByText("white text").length).toBeGreaterThan(0);
    expect(within(hidden).getAllByText("addresses an AI model directly").length).toBeGreaterThan(0);
  });

  it("lists every finding masked, each linking to its document", () => {
    const report = sampleAudit();
    render(<SecurityPage report={report} />);
    const table = screen.getByRole("table", { name: "Every finding" });
    const rows = within(table).getAllByRole("row").slice(1);
    // A page of rows at a time.
    expect(rows).toHaveLength(25);
    // Severity and confidence are icons, each with its word for a screen reader.
    expect(within(rows[0] as HTMLElement).getByTitle("High severity")).toHaveTextContent("High severity");
    expect(within(rows[0] as HTMLElement).getByTitle("Certain")).toHaveTextContent("Certain");
    const [finding, document] = within(rows[0] as HTMLElement).getAllByRole("link");
    // The identifier opens its page with it marked; the document opens the document.
    expect(finding).toHaveAttribute("href", expect.stringMatching(/^#documents\/\d+\/\d+\/i\d+$/));
    expect(document).toHaveAttribute("href", expect.stringMatching(/^#documents\/\d+$/));
  });
});

describe("concepts a model found", () => {
  it("are listed apart, each opening its page", () => {
    const report = sampleAudit();
    const document = report.documents[0];
    if (!document) throw new Error("the sample has no document");
    document.concept_findings = [
      { page: 2, concept: "renewal_quote", label: "Renewal quote", severity: "high", score: 0.91 },
    ];
    render(<SecurityPage report={report} />);
    const list = screen.getByRole("list", { name: "Found by a model" });
    expect(list).toHaveTextContent("Renewal quote");
    expect(list).toHaveTextContent("91%");
    expect(within(list).getByRole("link")).toHaveAttribute("href", "#documents/0/2");
  });

  it("are left out of a run that asked no model", () => {
    render(<SecurityPage report={sampleAudit()} />);
    expect(screen.queryByRole("list", { name: "Found by a model" })).not.toBeInTheDocument();
  });

  it("says which categories were not looked for, and why", () => {
    const report = sampleAudit();
    const unscanned = { category: "person_name", label: "Person name", reason: "no name model is installed" };
    const documents = report.documents.map((document) => ({
      ...document,
      sensitive: { ...document.sensitive, unscanned_categories: [unscanned] },
    }));
    render(<SecurityPage report={{ ...report, documents }} />);
    const notice = screen.getByRole("alert");
    expect(within(notice).getByText("1 category was not looked for")).toBeInTheDocument();
    expect(within(notice).getByText(/no name model is installed/)).toBeInTheDocument();
  });

  it("raises no notice when everything was looked for", () => {
    render(<SecurityPage report={sampleAudit()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("charts the ten most frequent kinds, and counts the rest", () => {
    const report = sampleAudit();
    const byCategory = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`kind_${i}`, 12 - i]));
    render(<SecurityPage report={{ ...report, aggregate: { ...report.aggregate, sensitive_by_category: byCategory } }} />);
    expect(screen.getByRole("button", { name: "and 2 more kinds, in every finding below" })).toBeInTheDocument();
  });

  it("downloads the findings as CSV, masked as the table shows them", async () => {
    const report = sampleAudit();
    const made: Blob[] = [];
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      made.push(blob as Blob);
      return "blob:findings";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<SecurityPage report={report} />);
    await userEvent.click(screen.getByRole("button", { name: /Download all as CSV/ }));
    expect(create).toHaveBeenCalled();
    const text = await (made[0] as Blob).text();
    expect(text.split("\r\n")[0]).toBe("severity,identifier,value,document,page,confidence,fingerprint");
    expect(text).toContain(report.documents.find((d) => d.sensitive.matches.length)?.sensitive.matches[0]?.masked ?? "");
  });

  it("opens the findings filtered as a link asks", () => {
    window.location.hash = "#security?severity=high";
    render(<SecurityPage report={sampleAudit()} />);
    const high = screen.getByRole("radio", { name: /High/ });
    expect(high).toHaveAttribute("data-state", "on");
    window.location.hash = "";
  });
});
