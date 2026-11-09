import { pick, type Dropped } from "./useUpload";

const served = (config: object) => {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "complydoc-local";
  script.textContent = JSON.stringify({ reports: "api/reports", sources: [], ...config });
  document.head.append(script);
  return () => script.remove();
};

const dropped = (...paths: string[]): Dropped[] => paths.map((path) => ({ file: new File(["x"], path), path }));

describe("pick", () => {
  let done: () => void;
  beforeEach(() => {
    done = served({ uploads: "api/uploads", documentTypes: [".pdf", ".docx"] });
  });
  afterEach(() => done());

  it("keeps the documents the server reads, and counts what it leaves out", () => {
    const picked = pick(dropped("msa.pdf", "Annex.DOCX", "notes.exe", ".DS_Store", "README"));
    expect(picked.documents.map((d) => d.path)).toEqual(["msa.pdf", "Annex.DOCX"]);
    expect(picked.skipped).toBe(3);
    expect(picked.name).toBe("");
  });

  it("names the upload after one folder, and keeps the paths inside it", () => {
    const picked = pick(dropped("contracts/msa.pdf", "contracts/annex/prices.pdf", "contracts/.git/x.pdf"));
    expect(picked.name).toBe("contracts");
    expect(picked.documents.map((d) => d.path)).toEqual(["msa.pdf", "annex/prices.pdf"]);
    expect(picked.skipped).toBe(1);
  });

  it("keeps the paths whole when several folders are dropped together", () => {
    const picked = pick(dropped("contracts/msa.pdf", "invoices/march.pdf"));
    expect(picked.name).toBe("");
    expect(picked.documents.map((d) => d.path)).toEqual(["contracts/msa.pdf", "invoices/march.pdf"]);
  });
});
