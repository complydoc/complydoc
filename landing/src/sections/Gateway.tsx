import { LayerArt } from "@/art/LayerArt";
import { Section, TextLink } from "@/components/Section";
import { links } from "@/links";

/** The four verdicts `check_document` gives, and when. */
const VERDICTS: { verdict: string; when: string }[] = [
  { verdict: "Ready to send", when: "No identifiers and no hidden text" },
  { verdict: "Send with care", when: "Identifiers that are not sensitive, such as an email address" },
  { verdict: "Do not send as it is", when: "A sensitive identifier, or any text hidden from a reader" },
  { verdict: "Could not be read", when: "Empty, damaged, password protected, or a scan OCR found nothing in" },
];

/** The gateway: `complydoc mcp` between a folder and any assistant, with the verdict it gives. */
export function Gateway() {
  return (
    <Section
      id="gateway"
      title="The gateway"
      lead={
        <>
          <code className="font-mono text-base">complydoc mcp</code> serves a folder to any assistant over the Model
          Context Protocol. Every document is read, checked and cleaned on the computer, and only the clean copy
          crosses over. The file itself never does.
        </>
      }
    >
      <div className="flex flex-col gap-14">
        <LayerArt />
        <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <h3 className="text-2xl font-medium tracking-tight">A verdict before anything is shared</h3>
            <p className="text-pretty text-muted-foreground">
              <code className="font-mono text-sm">check_document</code> answers whether a file is fit to share, with
              what the answer rests on and none of the file's content. The check reads scans with the same OCR the
              assistant would get, so the verdict and the text never disagree.
            </p>
            <p>
              <TextLink href={links.assistant}>The gateway guide</TextLink>
            </p>
          </div>
          <dl className="flex flex-col border-t">
            {VERDICTS.map((row) => (
              <div key={row.verdict} className="grid gap-1 border-b py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                <dt className="font-mono text-sm">{row.verdict}</dt>
                <dd className="text-pretty text-muted-foreground">{row.when}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}
