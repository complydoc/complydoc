import type { ReactNode } from "react";
import { Section, TextLink } from "@/components/Section";
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
      lead="complydoc's real output on two sample documents. Nothing here is mocked up."
    >
      <div className="flex flex-col gap-16">
        <Demo
          label="Compare loaders"
          title="Same page, two loaders, two different texts."
          more={<TextLink href={links.compareLoaders}>Compare yours</TextLink>}
          text="PyPDF reads each column in turn. PDFPlumber reads straight across both and splices the clauses together, with no error."
        >
          <LoaderDiffDemo />
        </Demo>
        <Demo
          label="Find hidden text"
          title="Flag malicious attempts on your documents."
          more={<TextLink href={links.hiddenContent}>How hidden text is found</TextLink>}
          text="This CV hides an instruction to the model in a line set at half a point. complydoc finds it and says why it was flagged."
        >
          <HiddenTextDemo />
        </Demo>
      </div>
    </Section>
  );
}

function Demo({
  label,
  title,
  text,
  more,
  children,
}: {
  label: string;
  title: string;
  text: string;
  more: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-xs tracking-wide text-primary uppercase">{label}</p>
        <h3 className="text-2xl font-semibold tracking-tight text-balance">{title}</h3>
        <p className="text-pretty text-muted-foreground">
          {text} {more}
        </p>
      </div>
      {children}
    </div>
  );
}
