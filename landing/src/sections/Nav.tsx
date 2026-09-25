import { Logo } from "@/components/Logo";
import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { links, VERSION } from "@/links";

const SECTIONS = [
  { href: "#problem", label: "Why" },
  { href: "#questions", label: "Questions" },
  { href: "#router", label: "Page router" },
  { href: "#integrations", label: "Integrations" },
  { href: "#models", label: "Models" },
];

/** A thin bar across the top, as in the viewer: the mark, where to go, the theme at the right. */
export function Nav() {
  const { dark, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <a href="#top" aria-label="complydoc, back to the top">
          <Logo size={20} />
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map((section) => (
            <Button key={section.href} variant="ghost" size="sm" asChild>
              <a href={section.href}>{section.label}</a>
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
