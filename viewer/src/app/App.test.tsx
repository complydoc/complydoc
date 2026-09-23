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

    expect(await screen.findByRole("tab", { name: "summary", selected: true })).toBeInTheDocument();
    expect(screen.getByText("loaders.json")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /documents/ }));
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
    await userEvent.click(screen.getByRole("button", { name: "Open the sample" }));
    expect(await screen.findByText(/sample: pypdf vs pdfplumber/)).toBeInTheDocument();
  });

  it("goes back to the open screen", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open the sample" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open another" }));
    expect(screen.getByRole("heading", { name: "Open a report" })).toBeInTheDocument();
  });

  it("switches the theme from the header", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open the sample" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
  });
});
