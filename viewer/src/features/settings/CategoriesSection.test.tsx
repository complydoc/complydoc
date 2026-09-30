import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoriesState } from "@/hooks/useCategories";
import { notLookedFor } from "@/report/limitations";
import type { CategoryRow } from "@/report/types";
import { sampleAudit } from "@/test/sample";
import { CategoriesSection } from "./CategoriesSection";

const row = (id: string, label: string, over: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  label,
  region: "UK",
  detector: "regex",
  model_backed: false,
  enabled: true,
  severity: "medium",
  shipped_enabled: true,
  shipped_severity: "medium",
  ...over,
});

function state(over: Partial<CategoriesState> = {}): CategoriesState {
  return {
    editable: true,
    file: "/work/.complydoc-categories.yaml",
    categories: [
      row("iban", "IBAN", { severity: "high", shipped_severity: "high" }),
      row("us_zip_code", "US ZIP code", { region: "US", enabled: false }),
      row("person_name", "Person name", { model_backed: true }),
    ],
    error: null,
    change: vi.fn(async () => true),
    reset: vi.fn(async () => true),
    ...over,
  };
}

describe("CategoriesSection", () => {
  it("lists every category and says which were changed", () => {
    render(<CategoriesSection state={state()} lastRun={null} />);
    const list = screen.getByRole("list", { name: "Categories" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByRole("checkbox", { name: "Look for US ZIP code" })).not.toBeChecked();
    expect(within(list).getByRole("checkbox", { name: "Look for IBAN" })).toBeChecked();
    expect(list).toHaveTextContent("Read by a model");
    expect(list).toHaveTextContent("Changed");
  });

  it("switches a category off, and puts a changed one back", async () => {
    const current = state();
    render(<CategoriesSection state={current} lastRun={null} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Look for IBAN" }));
    expect(current.change).toHaveBeenCalledWith("iban", { enabled: false });
    await userEvent.click(screen.getByRole("button", { name: "Put US ZIP code back as shipped" }));
    expect(current.reset).toHaveBeenCalledWith("us_zip_code");
  });

  it("finds categories and shows only the ones changed", async () => {
    render(<CategoriesSection state={state()} lastRun={null} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Find a category" }), "zip");
    expect(within(screen.getByRole("list", { name: "Categories" })).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(screen.getByRole("searchbox", { name: "Find a category" }));
    await userEvent.click(screen.getByRole("radio", { name: "Switched off" }));
    expect(screen.getByRole("list", { name: "Categories" })).toHaveTextContent("US ZIP code");
    expect(screen.getByRole("list", { name: "Categories" })).not.toHaveTextContent("Person name");
  });

  it("shows what the run changed, read only, outside complydoc ui", () => {
    const summary = {
      file: "/work/.complydoc-categories.yaml",
      changes: [
        {
          category: "us_zip_code",
          label: "US ZIP code",
          enabled: false,
          severity: "medium" as const,
          shipped_enabled: true,
          shipped_severity: "medium" as const,
        },
      ],
    };
    render(<CategoriesSection state={state({ editable: false, categories: [] })} lastRun={summary} />);
    expect(screen.getByRole("list", { name: "Changed categories" })).toHaveTextContent("US ZIP code switched off");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("notLookedFor with a category switched off", () => {
  it("names it, for every document, beside those the run could not scan", () => {
    const report = sampleAudit();
    report.categories = {
      file: "/work/.complydoc-categories.yaml",
      changes: [
        {
          category: "us_zip_code",
          label: "US ZIP code",
          enabled: false,
          severity: "medium",
          shipped_enabled: true,
          shipped_severity: "medium",
        },
        {
          category: "iban",
          label: "IBAN",
          enabled: true,
          severity: "low",
          shipped_enabled: true,
          shipped_severity: "high",
        },
      ],
    };
    const found = notLookedFor(report);
    expect(found.map((f) => f.label)).toEqual(["US ZIP code"]);
    expect(found[0]?.documents).toBe(report.documents.length);
  });
});
