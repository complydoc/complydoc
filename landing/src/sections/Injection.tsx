import { BrandLogo } from "@/components/BrandLogo";
import { InjectionDemo } from "@/components/injection/InjectionDemo";
import { Section } from "@/components/Section";

export function Injection() {
  return (
    <Section
      id="injection"
      eyebrow="Prompt injection"
      title="How complydoc uses System One models to flag prompt injection"
      lead={
        <>
          Documents can carry text written for the model that reads them, not for the person. complydoc finds hidden
          text on your machine, catches plainly written instructions with patterns, and asks a System One model from
          TypeSafe AI about the rest.
        </>
      }
    >
      <div className="mb-10 flex items-center gap-2 text-sm text-muted-foreground">
        <BrandLogo brand="typesafe" className="h-7 w-5 text-foreground" />
        With TypeSafe AI&apos;s Jev
      </div>
      <InjectionDemo />
    </Section>
  );
}
