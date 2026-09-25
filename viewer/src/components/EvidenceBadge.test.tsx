import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SensitiveMatch } from "@/report/types";
import { EvidenceBadge } from "./EvidenceBadge";

const card: SensitiveMatch = {
  category: "card_number",
  label: "Payment card number",
  severity: "high",
  masked: "•••• 1111",
  page: 1,
  evidence: "confirmed",
  validators_passed: ["luhn", "card_issuer"],
  context_term: "Card",
  confidence: null,
};

describe("EvidenceBadge", () => {
  it("grades a finding in words, not in how it was checked", () => {
    render(<EvidenceBadge evidence="confirmed" match={card} />);
    expect(screen.getByRole("button", { name: "Certain: how this was validated" })).toHaveTextContent("Certain");
  });

  it("opens on every check the value passed", async () => {
    render(<EvidenceBadge evidence="confirmed" match={card} />);
    await userEvent.click(screen.getByRole("button", { name: /how this was validated/ }));
    expect(await screen.findByText(/Luhn checksum/)).toBeInTheDocument();
    expect(screen.getByText(/number range of a real card issuer/)).toBeInTheDocument();
    expect(screen.getByText("Found beside the label “Card”.")).toBeInTheDocument();
  });

  it("says a model's guess is a guess, with its score", async () => {
    render(
      <EvidenceBadge
        evidence="model"
        match={{ ...card, evidence: "model", validators_passed: [], context_term: null, confidence: 0.91 }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Possible: how this was validated" }));
    expect(await screen.findByText("The model's score was 91%.")).toBeInTheDocument();
  });
});
