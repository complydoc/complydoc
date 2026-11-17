import { Logo } from "@/components/Logo";
import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { links, VERSION } from "@/links";

/** The pages besides this one, each in a folder of its own. */
const PAGES = [
  { href: "contributors/", label: "Contributors" },
  { href: "enterprise/", label: "For teams" },
];

/**
 * A thin bar across the top, as in the viewer: the mark, where to go, the theme at the right.
 *
 * `home` is the way back to the landing page from the page showing the bar:
 * empty on it, `../` on a page in a folder of its own.
 */
export function Nav({ home = "" }: { home?: string }) {
  const { dark, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <a href={home || "#top"} data-page={home ? "" : undefined} aria-label={home ? "complydoc, home" : "complydoc, back to the top"}>
          <Logo size={20} />
        </a>
        <nav aria-label="Pages" className="hidden items-center gap-1 sm:flex">
          {PAGES.map((page) => (
            <Button key={page.href} variant="ghost" size="sm" asChild>
              <a href={`${home}${page.href}`} data-page="">
                {page.label}
              </a>
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild className="hidden font-mono text-xs text-muted-foreground sm:inline-flex">
            <a href={links.changelog}>v{VERSION}</a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={links.docs}>Docs</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={links.github}>GitHub</a>
          </Button>
          <ModeToggle dark={dark} onToggle={toggle} />
        </div>
      </div>
    </header>
  );
}
