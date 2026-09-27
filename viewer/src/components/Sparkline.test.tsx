import { render, screen } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("draws a figure across runs, with every value in words", () => {
    render(<Sparkline values={[12, 9, 4]} label="Identifiers found" />);
    expect(screen.getByRole("img", { name: "Identifiers found over the last 3 runs: 12, 9, 4" })).toBeInTheDocument();
  });

  it("draws nothing for a single run", () => {
    const { container } = render(<Sparkline values={[3]} label="Identifiers found" />);
    expect(container).toBeEmptyDOMElement();
  });
});
