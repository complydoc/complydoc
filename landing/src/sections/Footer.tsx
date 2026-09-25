import { Logo } from "@/components/Logo";
import { Separator } from "@/components/ui/separator";
import { links } from "@/links";

const COLUMNS = [
  {
    title: "Product",
    items: [
      { label: "Page router", href: "#router" },
      { label: "Integrations", href: "#integrations" },
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
      { label: "GitHub", href: links.github },
      { label: "Discussions", href: links.discussions },
      { label: "Examples", href: links.playground },
      { label: "PyPI", href: links.pypi },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1fr_auto]">
          <div className="flex max-w-sm flex-col gap-4">
            <Logo size={22} />
            <p className="text-sm text-muted-foreground">
              A document audit tool for AI pipelines. A hosted version for teams, complydoc Cloud, is planned.{" "}
              <a href={links.discussions} className="text-foreground underline underline-offset-4">
                Tell us if you would use it
              </a>
              .
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {COLUMNS.map((column) => (
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
          MIT licensed. Logos belong to their owners and are shown only to indicate compatibility.
        </p>
      </div>
    </footer>
  );
}
