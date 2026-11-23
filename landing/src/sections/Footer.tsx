import { GlyphField } from "@/art/GlyphField";
import { BrandLogo } from "@/components/BrandLogo";
import { CookieBanner } from "@/components/CookieBanner";
import { Logo } from "@/components/Logo";
import { GITHUB_PATH, LINKEDIN_PATH, MAIL_PATH, SocialLink } from "@/components/SocialIcons";
import { Button } from "@/components/ui/button";
import { openConsent } from "@/lib/consent";
import type { Brand } from "@/lib/logos";
import { CONTACT_EMAIL, LINKEDIN, links, VEIL } from "@/links";

const columns = (home: string) => [
  {
    title: "Product",
    items: [
      { label: "Try it", href: `${home}#try` },
      { label: "Router", href: `${home}router/` },
      { label: "Gateway", href: `${home}gateway/` },
      { label: "Benchmarks", href: `${home}#measured` },
      { label: "Integrations", href: `${home}#integrations` },
      { label: "Report viewer", href: links.viewer },
    ],
  },
  {
    title: "Docs",
    items: [
      { label: "Guides", href: links.docs },
      { label: "Command line", href: links.cli },
      { label: "Python API", href: links.api },
      { label: "Detection accuracy", href: links.accuracy },
      { label: "Changelog", href: links.changelog },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Contributors", href: `${home}contributors/` },
      { label: "Contributing", href: links.contributing },
      { label: "Discussions", href: links.discussions },
      { label: "Examples", href: links.playground },
      { label: "PyPI", href: links.pypi },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "GitHub", href: links.github },
      { label: "Veil", href: VEIL },
      { label: "Contact", href: `mailto:${CONTACT_EMAIL}` },
      { label: "MIT licence", href: links.license },
      { label: "Cookies", href: `${home}cookies/` },
    ],
  },
];

/** What complydoc plugs into, in the row above the bottom line. */
const WORKS_WITH: { brand: Brand; name: string }[] = [
  { brand: "langchain", name: "LangChain" },
  { brand: "llamaindex", name: "LlamaIndex" },
  { brand: "mcp", name: "Model Context Protocol" },
  { brand: "claudecode", name: "Claude Code" },
  { brand: "cursor", name: "Cursor" },
  { brand: "githubcopilot", name: "GitHub Copilot" },
  { brand: "openai", name: "OpenAI" },
  { brand: "anthropic", name: "Anthropic" },
  { brand: "gemini", name: "Gemini" },
  { brand: "mistral", name: "Mistral" },
];

/**
 * The bottom of every page: a black block with a field of characters behind it, the site's
 * links in columns, what it works with, and the legal line. It always uses the dark tokens, in
 * either theme, so it reads the same on a light and a dark page.
 *
 * `home` is the way back to the landing page, as for the nav bar.
 */
export function Footer({ home = "" }: { home?: string }) {
  return (
    <>
    <footer className="dark relative isolate overflow-hidden border-t border-white/10 bg-[#0a0a0a] text-foreground">
      <GlyphField />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-6 pt-20 pb-10">
        <div className="grid gap-14 lg:grid-cols-[5fr_7fr]">
          <div className="flex max-w-md flex-col items-start gap-6">
            <Logo size={24} />
            <p className="text-4xl font-medium tracking-tight text-balance text-white md:text-5xl">
              Get document loading right.
            </p>
            <p className="text-pretty text-white/70">Open source and MIT licensed. Runs on your machine.</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <a href={links.github}>Star on GitHub</a>
              </Button>
              <Button size="lg" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 dark:bg-transparent" asChild>
                <a href={links.docs}>Read the docs</a>
              </Button>
            </div>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4">
            {columns(home).map((column) => (
              <div key={column.title} className="flex flex-col gap-4">
                <p className="font-mono text-xs text-white/50">{column.title}</p>
                <ul className="flex flex-col gap-3 text-sm text-white/85">
                  {column.items.map((item) => (
                    <li key={item.label}>
                      <a href={item.href} className="transition-colors hover:text-primary">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-10">
          <p className="shrink-0 font-mono text-xs text-white/50">Works with</p>
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-5 text-white/75">
            {WORKS_WITH.map(({ brand, name }) => (
              <li key={brand} title={name}>
                <BrandLogo brand={brand} className="size-6 [&_*]:!fill-current" />
                <span className="sr-only">{name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-6 border-t border-white/15 pt-8 text-sm text-white/60 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} complydoc. Logos belong to their owners and show compatibility only.</p>
          <div className="flex gap-6 md:mx-auto">
            <a href={`${home}cookies/`} className="hover:text-white">
              Cookie policy
            </a>
            <button type="button" onClick={openConsent} className="cursor-pointer hover:text-white">
              Cookie settings
            </button>
          </div>
          <div className="flex gap-2">
            {LINKEDIN && <SocialLink href={LINKEDIN} label="complydoc on LinkedIn" path={LINKEDIN_PATH} />}
            <SocialLink href={links.github} label="complydoc on GitHub" path={GITHUB_PATH} />
            <SocialLink href={`mailto:${CONTACT_EMAIL}`} label={`Email ${CONTACT_EMAIL}`} path={MAIL_PATH} />
          </div>
        </div>
      </div>
    </footer>
    <CookieBanner policy={`${home}cookies/`} />
    </>
  );
}
