import { contextDetail, contextLabel, contextUrl, shortCommit } from "./runContext";

const COMMIT = "1b84563c5c734a03c262b67f792a62de420cbdfb";

describe("run context", () => {
  it("says the branch and the commit as people say them", () => {
    expect(shortCommit(COMMIT)).toBe("1b84563");
    expect(contextLabel({ branch: "main", commit: COMMIT })).toBe("main · 1b84563");
    expect(contextLabel({ branch: "main", commit: COMMIT, dirty: true })).toBe("main · 1b84563 +changes");
    expect(contextLabel({ commit: COMMIT })).toBe("1b84563");
    expect(contextLabel({ branch: "main" })).toBe("main");
  });

  it("has nothing to say of a run that recorded none, as every run before schema 23", () => {
    expect(contextLabel(undefined)).toBe("");
    expect(contextLabel(null)).toBe("");
    expect(contextDetail(null)).toBe("");
    expect(contextUrl(undefined)).toBeNull();
  });

  it("keeps the repository and workflow for a tooltip", () => {
    expect(contextDetail({ repository: "github.com/acme/docs", workflow: "documents" })).toBe(
      "github.com/acme/docs · documents",
    );
  });

  it("links only to a web page, whatever a report claims", () => {
    expect(contextUrl({ url: "https://github.com/acme/docs/actions/runs/77" })).toBe(
      "https://github.com/acme/docs/actions/runs/77",
    );
    expect(contextUrl({ url: "javascript:alert(1)" })).toBeNull();
    expect(contextUrl({ url: "" })).toBeNull();
  });
});
