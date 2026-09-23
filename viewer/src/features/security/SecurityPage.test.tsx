import { render, screen, within } from "@testing-library/react";
import { sampleReport } from "@/test/sample";
import { SecurityPage } from "./SecurityPage";

describe("SecurityPage", () => {
  it("counts by severity", () => {
    render(<SecurityPage report={sampleReport()} />);
    const severity = screen.getByRole("region", { name: "By severity" });
    expect(within(severity).getByText("High").nextElementSibling).toHaveTextContent("11");
  });

  it("orders the kinds most frequent first", () => {
    render(<SecurityPage report={sampleReport()} />);
    const rows = within(screen.getByRole("table", { name: /by kind/ })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Person name7");
  });

  it("lists only the documents that carry something", () => {
    render(<SecurityPage report={sampleReport()} />);
    const where = screen.getByRole("region", { name: "Where" });
    expect(within(where).getByText("4 of 9 documents")).toBeInTheDocument();
    expect(within(where).getAllByRole("row")).toHaveLength(5);
  });
});
