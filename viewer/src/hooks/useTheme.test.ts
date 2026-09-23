import { act, renderHook } from "@testing-library/react";
import { setSystemDark } from "@/test/setup";
import { useTheme } from "./useTheme";

const root = document.documentElement;

describe("useTheme", () => {
  it("follows the system until one is chosen", () => {
    setSystemDark(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
    expect(root).toHaveClass("dark");
  });

  it("pins a chosen theme and remembers it", () => {
    setSystemDark(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    expect(root).not.toHaveClass("dark");
    expect(localStorage.getItem("complydoc-theme")).toBe("light");
  });

  it("starts from the remembered theme", () => {
    localStorage.setItem("complydoc-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(root).toHaveClass("dark");
  });

  it("toggles to whichever theme is not showing, starting from the system's", () => {
    setSystemDark(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.dark).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
    expect(root).not.toHaveClass("dark");
    act(() => result.current.toggle());
    expect(root).toHaveClass("dark");
  });
});
