import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { type Consent, openConsent, useConsent } from "@/lib/consent";
import { CONTACT_EMAIL } from "@/links";
import { Page, PageHeader } from "@/pages/Page";

const UPDATED = "20 November 2026";

const STORED = [
  {
    name: "cd_consent",
    kind: "Necessary cookie",
    purpose: "Remembers whether you accepted or declined analytics, on complydoc.io and veil.complydoc.io.",
    kept: "12 months",
  },
  {
    name: "complydoc-theme",
    kind: "Local storage",
    purpose: "Remembers light or dark mode, if you pick one.",
    kept: "Until you clear it",
  },
  {
    name: "_ga, _ga_*",
    kind: "Analytics cookies, only after Accept",
    purpose:
      "Tell visits apart, so we can see which pages are read, where visitors come from and whether they come back. Set by Google Analytics.",
    kept: "13 months",
  },

];

const CHOICE: Record<Consent | "none", string> = {
  granted: "You accepted analytics cookies.",
  denied: "You declined analytics cookies.",
  none: "You haven't chosen yet.",
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
      <div className="flex flex-col gap-4 text-pretty text-muted-foreground">{children}</div>
    </section>
  );
}

export function CookiesPage() {
  const consent = useConsent();
  const choice: Consent | "none" = consent === "unknown" ? "none" : (consent ?? "none");

  return (
    <Page>
      <PageHeader
        title="Cookie policy"
        lead={`What this site stores in your browser, why, and how to change your choice. Last updated ${UPDATED}.`}
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-14 px-6 pb-24">
        <Block title="In short">
          <p>
            Visits are counted without cookies. Analytics cookies are set only if you click Accept, and you can change
            your mind at any time.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={openConsent}>Change cookie settings</Button>
            <span className="text-sm">{CHOICE[choice]}</span>
          </div>
        </Block>

        <Block title="What we store">
<dl className="flex flex-col divide-y rounded-xl border">
            {STORED.map((row) => (
              <div key={row.name} className="grid gap-2 p-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
                <dt className="font-mono text-sm text-foreground">{row.name}</dt>
                <dd className="flex flex-col gap-1.5 text-sm">
                  <span className="text-foreground">{row.purpose}</span>
                  <span>
                    {row.kind} · {row.kept}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Block>

        <Block title="Visits counted without cookies">
          <p>
            GoatCounter counts page views: the page, the site you came from, your browser, screen size and country. It
            sets no cookies, keeps nothing in your browser and doesn't follow you to other sites, so it runs without
            asking.
          </p>
        </Block>

        <Block title="Analytics after you accept">
          <p>
            If you accept, Google Analytics sets cookies that tell one visit from another. That shows us how people
            move through the site and which pages help, so we can make it better. Advertising features and data
            sharing with other Google products are turned off, and we don't sell this data.
          </p>
        </Block>

        <Block title="Changing your choice">
          <p>
            Use Cookie settings at the bottom of any page, or the button above. Declining removes the analytics cookies
            this site set. You can also block or delete cookies in your browser's settings.
          </p>
        </Block>

        <Block title="Questions">
          <p>
            Write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Block>
      </div>
    </Page>
  );
}
