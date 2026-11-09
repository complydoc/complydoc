import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleText } from "@/test/sample";
import { App } from "./App";

describe("App", () => {
  it("starts on the open screen", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Open a report" })).toBeInTheDocument();
  });

  it("opens a chosen report on its traces, and moves between pages", async () => {
    render(<App />);
    const file = new File([sampleText], "loaders.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("Report files"), file);

    expect((await screen.findAllByRole("link", { name: /^Traces/, current: "page" })).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe("#pipeline");
    expect(screen.getAllByText("documents").length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("link", { name: "Documents" })[0] as HTMLElement);
    expect(await screen.findByRole("region", { name: "Documents" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#documents");
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

  it("opens several reports of one folder as its runs, each named by its kind", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Both, as two runs of one folder" }));
    await userEvent.click(await screen.findByRole("button", { name: "Switch folder" }));
    expect(await screen.findByRole("menuitem", { name: /^Audit/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^Loader comparison/ })).toBeInTheDocument();
    // An audit and a loader comparison measure different things: neither is "the run before" the other.
    expect(screen.queryByRole("region", { name: "Changed since the run before" })).not.toBeInTheDocument();
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
    expect((await screen.findAllByRole("link", { name: /^Traces/, current: "page" })).length).toBeGreaterThan(0);
  });

  it("goes back to the open screen", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    await userEvent.click(await screen.findByRole("button", { name: "Switch folder" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Close all/ }));
    expect(screen.getByRole("heading", { name: "Open a report" })).toBeInTheDocument();
  });

  it("switches the theme from the header", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "pypdf against pdfplumber" }));
    await userEvent.click(await screen.findByRole("button", { name: "Switch to the dark theme" }, { timeout: 8000 }));
    // The button changes when the theme does; the class follows in an effect, which a busy
    // CI runner can take several seconds to reach.
    expect(
      await screen.findByRole("button", { name: "Switch to the light theme" }, { timeout: 8000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"), { timeout: 8000 });
  }, 20000);

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

  it("audits documents dropped on it when complydoc ui takes them, then opens the report", async () => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "complydoc-local";
    script.textContent = JSON.stringify({
      reports: "api/reports",
      sources: ["/work/.complydoc"],
      uploads: "api/uploads",
      documentTypes: [".pdf"],
    });
    document.head.append(script);
    const status = (state: string, extra: object = {}) =>
      new Response(
        JSON.stringify({ id: "u1", name: "contracts", folder: "/work/.complydoc/uploads/contracts", state, files: 1, done: 0, total: 1, current: "", error: "", report: null, ...extra }),
      );
    const asked: string[] = [];
    let listed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push(`${init?.method ?? "GET"} ${url}`);
        if (url === "api/reports") {
          const reports = listed ? [{ id: "r1", name: "uploads/contracts.json", url: "api/reports/r1" }] : [];
          listed = true;
          return new Response(JSON.stringify({ reports }));
        }
        if (url === "api/reports/r1") return new Response(sampleText);
        if (url === "api/uploads") return status("receiving", { files: 0 });
        if (url.endsWith("/audit")) return status("reading", { current: "msa.pdf" });
        if (url === "api/uploads/u1") return status("done", { done: 1, report: "r1" });
        return status("receiving");
      }),
    );
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Audit documents" })).toBeInTheDocument();
    const files = [new File(["%PDF"], "msa.pdf"), new File(["x"], "notes.exe")];
    await userEvent.upload(screen.getByLabelText("Documents"), files);
    expect(await screen.findByRole("button", { name: "Switch folder" }, { timeout: 5000 })).toBeInTheDocument();
    expect(asked).toContain("PUT api/uploads/u1/files/msa.pdf");
    expect(asked.some((a) => a.includes("notes.exe"))).toBe(false);
    expect(asked).toContain("POST api/uploads/u1/audit");
    script.remove();
    vi.unstubAllGlobals();
  });
});
