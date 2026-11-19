import { Logo } from "@/components/Logo";
import { Separator } from "@/components/ui/separator";
import { links } from "@/links";

const columns = (home: string) => [
  {
    title: "Product",
    items: [
      { label: "Try it", href: `${home}#try` },
      { label: "Features", href: `${home}#features` },
      { label: "Quickstart", href: `${home}#quickstart` },
      { label: "Integrations", href: `${home}#integrations` },
      { label: "For teams", href: `${home}enterprise/` },
      { label: "Veil", href: `${home}veil/` },
      { label: "Router and gateway", href: `${home}gateway/` },
      { label: "Report viewer", href: links.viewer },
      { label: "Changelog", href: links.changelog },
    ],
  },
  {
    title: "Docs",
    items: [
      { label: "Guides", href: links.docs },
      { label: "Command line", href: links.cli },
      { label: "Python API", href: links.api },
      { label: "Detection accuracy", href: links.accuracy },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Contributors", href: `${home}contributors/` },
      { label: "GitHub", href: links.github },
      { label: "Discussions", href: links.discussions },
      { label: "Examples", href: links.playground },
      { label: "PyPI", href: links.pypi },
    ],
  },
];

/** `home` is the way back to the landing page, as for the nav bar. */
export function Footer({ home = "" }: { home?: string }) {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1fr_auto]">
          <div className="flex max-w-lg flex-col gap-4">
            <Logo size={22} />
            <p className="text-sm text-muted-foreground">
              Get document loading right. For teams whose assistants read documents:{" "}
              <a href={`${home}enterprise/`} className="text-foreground underline underline-offset-4">
                talk to us
              </a>
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns(home).map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <p className="text-sm font-medium">{column.title}</p>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  {column.items.map((item) => (
                    <li key={item.label}>
                      <a href={item.href} className="hover:text-foreground">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <Separator />
        <p className="text-xs text-muted-foreground">
          MIT licensed. Logos belong to their owners and are shown only to indicate compatibility. This site counts
          visits without cookies.
        </p>
      </div>
    </footer>
  );
}
