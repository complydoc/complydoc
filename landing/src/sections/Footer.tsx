import { WORDMARK } from "@/ascii";
import { links } from "@/links";

const COLUMNS = [
  {
    title: "Docs",
    items: [
      { label: "Guides", href: links.docs },
      { label: "Command line", href: links.cli },
      { label: "Python API", href: links.api },
      { label: "Report JSON", href: links.reportSchema },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "GitHub", href: links.github },
      { label: "Changelog", href: links.changelog },
      { label: "Report viewer", href: links.viewer },
      { label: "Discussions", href: links.discussions },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 border-x px-6 py-14 md:grid-cols-[1fr_auto] md:px-10">
        <div className="flex flex-col gap-4">
          <pre aria-label="complydoc" className="ascii text-xs leading-[1.2] text-muted-foreground">
            {WORDMARK}
          </pre>
          <p className="max-w-sm text-sm text-muted-foreground">
            complydoc Cloud, a hosted companion for teams, is planned: history across runs and shared reports.{" "}
            <a href={links.discussions} className="text-foreground underline decoration-border underline-offset-4">
              Say if your team would use it
            </a>
            .
          </p>
          <p className="font-mono text-xs text-faint">MIT licensed</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-12">
          {COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{column.title}</p>
              <ul className="flex flex-col gap-2 text-sm">
                {column.items.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="hover:text-primary">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
