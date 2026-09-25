import { Logo } from "@/components/Logo";
import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { links, VERSION } from "@/links";

const SECTIONS = [
  { href: "#checks", label: "Checks" },
  { href: "#loaders", label: "Loaders" },
  { href: "#routing", label: "Routing" },
  { href: "#ci", label: "CI" },
  { href: "#offline", label: "Offline" },
];

/** A thin bar across the top, as in the viewer: the mark, where to go, the theme at the right. */
export function Nav() {
  const { dark, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 border-x px-6 md:px-10">
        <a href="#top" className="flex items-center gap-2" aria-label="complydoc, back to the top">
          <Logo size={18} />
        </a>
        <a
          href={links.changelog}
          className="hidden font-mono text-xs text-muted-foreground hover:text-foreground sm:inline"
        >
          v{VERSION}
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
          {SECTIONS.map((section) => (
            <a key={section.href} href={section.href} className="hover:text-foreground">
              {section.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <a href={links.docs}>Docs</a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={links.github}>GitHub</a>
          </Button>
          <ModeToggle dark={dark} onToggle={toggle} />
        </div>
      </div>
    </header>
  );
}
