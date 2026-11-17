import { Section, TextLink } from "@/components/Section";
import { Separator } from "@/components/ui/separator";
import { HiddenTextDemo } from "@/demos/HiddenTextDemo";
import { LoaderDiffDemo } from "@/demos/LoaderDiffDemo";
import { links } from "@/links";

/** The two things people need to see happen to believe: loaders disagree, and pages hide text. */
export function Demos() {
  return (
    <Section
      id="try"
      eyebrow="Try it"
      title="See what your model would be given."
      lead="Two things complydoc shows you on your own documents, here on sample ones. Every reading and every finding below is complydoc's real output; nothing is mocked up."
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-8">
          <header className="flex max-w-3xl flex-col gap-4">
            <p className="font-mono text-xs tracking-wide text-primary uppercase">Compare loaders</p>
            <h3 className="text-2xl font-semibold tracking-tight text-balance">
              Four popular PDF loaders, one page, four different texts.
            </h3>
            <p className="text-pretty text-muted-foreground">
              A loader decides what your model will ever read, and it fails without an error: a table read cell by
              cell, two columns spliced into one sentence, an email address glued to the word before it. Pick a page
              and two loaders and read the difference.{" "}
              <TextLink href={links.compareLoaders}>Compare yours</TextLink>
            </p>
          </header>
          <LoaderDiffDemo />
        </div>
        <Separator className="my-8" />
        <div className="flex flex-col gap-8">
          <header className="flex max-w-3xl flex-col gap-4">
            <p className="font-mono text-xs tracking-wide text-primary uppercase">Find hidden text</p>
            <h3 className="text-2xl font-semibold tracking-tight text-balance">
              Text a person cannot see, and a model reads.
            </h3>
            <p className="text-pretty text-muted-foreground">
              White text, a font half a point high, words under a white box: the page looks clean, and the text layer
              carries a message for whatever model summarises it. complydoc draws each page and checks every
              character against what is drawn there.{" "}
              <TextLink href={links.hiddenContent}>How hidden text is found</TextLink>
            </p>
          </header>
          <HiddenTextDemo />
        </div>
      </div>
    </Section>
  );
}
