import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { explainPage, summarise } from "@/report/diffExplain";
import { DiffSummary } from "./DiffSummary";

describe("DiffSummary", () => {
  it("names each kind of difference with its pages, and goes to one", async () => {
    const pages = [
      explainPage(2, "Total due 78,500.00", "Total due 78,5OO.OO"),
      explainPage(5, "Title passes on payment in full.", "Title passes"),
    ].filter((page) => page !== null);
    const onPage = vi.fn();
    render(<DiffSummary summaries={summarise(pages)} compareName="OCR" onPage={onPage} />);

    const list = screen.getByRole("list", { name: "What differs" });
    expect(list).toHaveTextContent("Numbers changed1 number78,500.00 → 78,5OO.OOpage2");
    expect(list).toHaveTextContent("Missing from OCR4 wordspage5");
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    expect(onPage).toHaveBeenCalledWith(5);
  });

  it("shows nothing when the readings hold the same words", () => {
    const { container } = render(<DiffSummary summaries={[]} compareName="OCR" onPage={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
