import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGoKeys } from "./useGoKeys";

function Harness({ onHelp }: { onHelp: () => void }) {
  useGoKeys(onHelp);
  return <input aria-label="Search" />;
}

describe("useGoKeys", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("opens a page with G then its key", async () => {
    render(<Harness onHelp={() => undefined} />);
    await userEvent.keyboard("gs");
    expect(window.location.hash).toBe("#security");
    await userEvent.keyboard("gt");
    expect(window.location.hash).toBe("#pipeline");
  });

  it("leaves keys typed into a field alone", async () => {
    const { getByRole } = render(<Harness onHelp={() => undefined} />);
    await userEvent.type(getByRole("textbox", { name: "Search" }), "gs?");
    expect(window.location.hash).toBe("");
  });

  it("does nothing for a key that is not a page's", async () => {
    render(<Harness onHelp={() => undefined} />);
    await userEvent.keyboard("gz");
    expect(window.location.hash).toBe("");
  });

  it("asks for the shortcuts with ?", async () => {
    const onHelp = vi.fn();
    render(<Harness onHelp={onHelp} />);
    await userEvent.keyboard("?");
    expect(onHelp).toHaveBeenCalledTimes(1);
  });
});
