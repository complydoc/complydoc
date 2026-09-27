import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IgnoreContext, type IgnoreRequest, type IgnoreState } from "@/hooks/useIgnores";
import { findingRows } from "@/report/security";
import { renderPage } from "@/test/render";
import { fingerprinted } from "@/test/fingerprinted";
import { sampleAudit } from "@/test/sample";
import { ReviewQueue } from "./ReviewQueue";

const report = fingerprinted(sampleAudit());
const rows = findingRows(report);

function served(requests: IgnoreRequest[]): IgnoreState {
  return {
    editable: true,
    file: "/work/.complydoc-ignore.yaml",
    entries: [],
    error: null,
    ignore: async (request) => {
      requests.push(request);
      return true;
    },
    unignore: async () => true,
  };
}

describe("ReviewQueue", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "#security/review/0";
  });

  it("keeps a finding with C and moves to the next one not reviewed", async () => {
    renderPage(<ReviewQueue report={report} at={0} />);
    expect(screen.getByText(`Finding 1 of ${rows.length}`)).toBeInTheDocument();
    await userEvent.keyboard("c");
    expect(window.location.hash).toBe("#security/review/1");
    expect(localStorage.getItem(`complydoc-reviewed:${report.run.target}`)).toContain(rows[0]?.source.fingerprint);
  });

  it("ignores a finding with the reason typed, through the ignore file", async () => {
    const requests: IgnoreRequest[] = [];
    renderPage(
      <IgnoreContext.Provider value={served(requests)}>
        <ReviewQueue report={report} at={0} />
      </IgnoreContext.Provider>,
    );
    await userEvent.keyboard("i");
    expect(screen.getByLabelText("Reason to ignore it")).toHaveFocus();
    await userEvent.keyboard("Our own account{Enter}");
    expect(requests).toEqual([
      expect.objectContaining({ finding: rows[0]?.source.fingerprint, reason: "Our own account" }),
    ]);
  });

  it("moves with J and K, and leaves for the Security page with Esc", async () => {
    renderPage(<ReviewQueue report={report} at={2} />);
    await userEvent.keyboard("j");
    expect(window.location.hash).toBe("#security/review/3");
    await userEvent.keyboard("k");
    expect(window.location.hash).toBe("#security/review/1");
    await userEvent.keyboard("{Escape}");
    expect(window.location.hash).toBe("#security");
  });
});
