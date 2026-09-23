import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleText } from "@/test/sample";
import { App } from "./App";

describe("App", () => {
  it("starts on the open screen", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Open a report" })).toBeInTheDocument();
  });

  it("opens a chosen report on the summary, and moves between pages", async () => {
    render(<App />);
    const file = new File([sampleText], "loaders.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("Report file"), file);

    expect((await screen.findAllByRole("link", { name: "Summary", current: "page" })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("loaders.json").length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("link", { name: "Documents" })[0] as HTMLElement);
    expect(await screen.findByRole("region", { name: "Loaders" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#documents");
  });

  it("explains a file it cannot open and stays put", async () => {
    render(<App />);
    const file = new File(["{}"], "package.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("Report file"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("package.json: This JSON is not a complydoc report.");
  });

  it("opens the bundled sample", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    expect((await screen.findAllByText(/sample: pypdf against pdfplumber/)).length).toBeGreaterThan(0);
  });

  it("goes back to the open screen", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    await userEvent.click((await screen.findAllByRole("button", { name: /Open another/ }))[0] as HTMLElement);
    expect(screen.getByRole("heading", { name: "Open a report" })).toBeInTheDocument();
  });

  it("switches the theme from the header", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    await userEvent.click(await screen.findByRole("button", { name: "Switch to the dark theme" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Switch to the light theme" })).toBeInTheDocument();
  });
});
