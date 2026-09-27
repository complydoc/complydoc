import { render, screen } from "@testing-library/react";
import { PageErrorBoundary } from "./PageErrorBoundary";

function Throws({ message }: { message: string }): never {
  throw new Error(message);
}

describe("PageErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps a page's failure to the page, with a way back", () => {
    render(
      <PageErrorBoundary>
        <Throws message="documents is not iterable" />
      </PageErrorBoundary>,
    );
    expect(screen.getByText("This page could not be shown")).toBeInTheDocument();
    expect(screen.getByText(/documents is not iterable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("says the viewer was updated when a part of it is gone from the server", () => {
    render(
      <PageErrorBoundary>
        <Throws message="Failed to fetch dynamically imported module: /assets/GitDiff-old.js" />
      </PageErrorBoundary>,
    );
    expect(screen.getByText("The viewer was updated")).toBeInTheDocument();
  });

  it("draws the page when nothing fails", () => {
    render(
      <PageErrorBoundary>
        <p>The page</p>
      </PageErrorBoundary>,
    );
    expect(screen.getByText("The page")).toBeInTheDocument();
  });
});
