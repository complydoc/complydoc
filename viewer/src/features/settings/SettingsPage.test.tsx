import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IgnoreContext, type IgnoreState } from "@/hooks/useIgnores";
import { conceptId } from "@/report/concepts";
import { documentFindings, ignoreDescription } from "@/report/pageFindings";
import type { Report } from "@/report/types";
import { required, sampleAudit } from "@/test/sample";
import { ConceptForm } from "./ConceptForm";
import { SettingsPage } from "./SettingsPage";

function withSetup(): Report {
  const report = sampleAudit();
  report.ignores = {
    file: "/work/.complydoc-ignore.yaml",
    rules: [{ finding: "id-0000000000000001", reason: "Our own account.", matched: 2, what: "IBAN ••54 32" }],
  };
  report.concepts = {
    file: "/work/.complydoc-concepts.yaml",
    concepts: [
      {
        id: "tariff_engine_id",
        label: "Tariff engine ID",
        description: "An identifier from our tariff engine.",
        pattern: "TE-\\d{4}-\\d{5}",
        severity: "high",
        found: 4,
      },
    ],
  };
  return report;
}

function readOnly(report: Report): IgnoreState {
  return {
    editable: false,
    file: report.ignores?.file ?? null,
    entries: report.ignores?.rules ?? [],
    error: null,
    ignore: async () => false,
    unignore: async () => false,
  };
}

describe("SettingsPage", () => {
  it("shows what the run used, read only, outside complydoc ui", () => {
    const report = withSetup();
    render(
      <IgnoreContext.Provider value={readOnly(report)}>
        <SettingsPage report={report} />
      </IgnoreContext.Provider>,
    );
    expect(screen.getByText("Read only")).toBeInTheDocument();
    const ignored = screen.getByRole("list", { name: "Ignored findings" });
    expect(ignored).toHaveTextContent("Our own account.");
    expect(ignored).toHaveTextContent("Set aside 2 on this run");
    const concepts = screen.getByRole("list", { name: "Your concepts" });
    expect(concepts).toHaveTextContent("Tariff engine ID");
    expect(concepts).toHaveTextContent("Found 4 times on this run");
    expect(screen.queryByRole("button", { name: /Add a concept/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop ignoring/ })).not.toBeInTheDocument();
  });
});

describe("ConceptForm", () => {
  it("tries a pattern on some text before it is saved", async () => {
    render(<ConceptForm taken={[]} onSave={async () => true} onCancel={() => {}} error={null} />);
    await userEvent.type(screen.getByPlaceholderText("TE-\\d{4}-\\d{5}"), "TE-\\d{{4}");
    await userEvent.type(screen.getByLabelText("Text to try the pattern on"), "ref TE-2024 here");
    expect(screen.getByRole("status")).toHaveTextContent("Finds “TE-2024”");
  });

  it("will not save a concept nothing would find, or a broken pattern", async () => {
    const onSave = vi.fn(async () => true);
    render(<ConceptForm taken={[]} onSave={onSave} onCancel={() => {}} error={null} />);
    await userEvent.type(screen.getByPlaceholderText("Tariff engine ID"), "Policy number");
    await userEvent.type(screen.getByRole("textbox", { name: "What it is" }), "A policy number.");
    expect(screen.getByText(/nothing will find it/)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("TE-\\d{4}-\\d{5}"), "PN-(");
    expect(screen.getAllByText("This is not a valid regular expression.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Add concept" })).toBeDisabled();
  });

  it("saves a new concept under an id made from its name", async () => {
    const onSave = vi.fn(async () => true);
    render(<ConceptForm taken={["policy_number"]} onSave={onSave} onCancel={() => {}} error={null} />);
    await userEvent.type(screen.getByPlaceholderText("Tariff engine ID"), "Policy number");
    await userEvent.type(screen.getByRole("textbox", { name: "What it is" }), "A policy number.");
    await userEvent.type(screen.getByPlaceholderText("TE-\\d{4}-\\d{5}"), "PN-\\d+");
    await userEvent.click(screen.getByRole("button", { name: "Add concept" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "policy_number_2", label: "Policy number", pattern: "PN-\\d+" }),
    );
  });
});

describe("concept ids", () => {
  it("come from the name, accents dropped, never starting with a digit", () => {
    expect(conceptId("Número de apólice", [])).toBe("numero_de_apolice");
    expect(conceptId("2024 tariff", [])).toBe("c_2024_tariff");
    expect(conceptId("!!!", [])).toBe("concept");
  });
});

describe("the ignore file", () => {
  it("is given a finding's masked form, whatever the screen shows", () => {
    const document = required(sampleAudit().documents.find((d) => d.sensitive.matches.length > 0));
    const [shown] = documentFindings(document, true);
    const finding = required(shown);
    const described = ignoreDescription({ ...finding, value: "the value in the clear" });
    expect(described).not.toContain("the value in the clear");
    expect(described).toContain(finding.match?.masked ?? "");
  });
});
