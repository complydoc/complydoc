import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleText } from "@/test/sample";
import { App } from "./App";

describe("App", () => {
  it("starts on the open screen", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Open a report" })).toBeInTheDocument();
  });

  it("opens a chosen report on Home, and moves between pages", async () => {
    render(<App />);
    const file = new File([sampleText], "loaders.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("Report files"), file);

    expect((await screen.findAllByRole("link", { name: "Home", current: "page" })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("documents").length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("link", { name: "Loaders" })[0] as HTMLElement);
    expect(await screen.findByRole("region", { name: "Loaders" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#loaders");
  });

  it("explains a file it cannot open and stays put", async () => {
    render(<App />);
    const file = new File(["{}"], "package.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("Report files"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("package.json: This JSON is not a complydoc report.");
  });

  it("opens the bundled sample, named after the folder it read", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    expect((await screen.findAllByText("documents")).length).toBeGreaterThan(0);
  });

  it("opens several reports of one folder as its runs, and says what changed", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Both, as two runs of one folder" }));
    expect(await screen.findByRole("region", { name: "Changed since the run before" })).toBeInTheDocument();
  });

  it("shows several folders side by side, and opens one", async () => {
    render(<App />);
    const files = ["/data/contracts", "/data/invoices"].map((target) => {
      const data = JSON.parse(sampleText);
      data.run.target = target;
      data.loader_comparison = null;
      return new File([JSON.stringify(data)], `${target.split("/").pop()}.json`, { type: "application/json" });
    });
    await userEvent.upload(screen.getByLabelText("Report files"), files);
    const folders = await screen.findByRole("table", { name: "Folders" });
    expect(folders).toHaveTextContent("contracts");
    expect(folders).toHaveTextContent("invoices");
    await userEvent.click(screen.getByRole("button", { name: "invoices" }));
    expect((await screen.findAllByRole("link", { name: "Home", current: "page" })).length).toBeGreaterThan(0);
  });

  it("goes back to the open screen", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    await userEvent.click(await screen.findByRole("button", { name: "Switch collection" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Close all/ }));
    expect(screen.getByRole("heading", { name: "Open a report" })).toBeInTheDocument();
  });

  it("switches the theme from the header", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    await userEvent.click(await screen.findByRole("button", { name: "Switch to the dark theme" }));
    // The class is applied in an effect after the click, which a busy run can take a moment to reach.
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(screen.getByRole("button", { name: "Switch to the light theme" })).toBeInTheDocument();
  });

  it("opens on the reports complydoc ui found, and explains an empty folder", async () => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "complydoc-local";
    script.textContent = JSON.stringify({ reports: "api/reports", sources: ["/work/.complydoc"] });
    document.head.append(script);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ reports: [] }))),
    );
    render(<App />);
    expect(await screen.findByRole("heading", { name: "No reports yet" })).toBeInTheDocument();
    expect(screen.getByText("/work/.complydoc")).toBeInTheDocument();
    script.remove();
    vi.unstubAllGlobals();
  });
});
