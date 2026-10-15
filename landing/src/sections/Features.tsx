import findDarkPoster from "@/assets/recordings/find-dark.webp";
import findDark from "@/assets/recordings/find-dark.mp4";
import findLightPoster from "@/assets/recordings/find-light.webp";
import findLight from "@/assets/recordings/find-light.mp4";
import diffDarkPoster from "@/assets/recordings/diff-dark.webp";
import diffDark from "@/assets/recordings/diff-dark.mp4";
import diffLightPoster from "@/assets/recordings/diff-light.webp";
import diffLight from "@/assets/recordings/diff-light.mp4";
import expectDarkPoster from "@/assets/recordings/expect-dark.webp";
import expectDark from "@/assets/recordings/expect-dark.mp4";
import expectLightPoster from "@/assets/recordings/expect-light.webp";
import expectLight from "@/assets/recordings/expect-light.mp4";
import documentDark from "@/assets/screens/document-dark.webp";
import documentLight from "@/assets/screens/document-light.webp";
import securityDark from "@/assets/screens/security-dark.webp";
import securityLight from "@/assets/screens/security-light.webp";
import { FeatureRow } from "@/components/FeatureRow";
import { Recording } from "@/components/Recording";
import { RouteLegend, RouteMap } from "@/components/RouteMap";
import { Screenshot } from "@/components/Screenshot";
import { Section } from "@/components/Section";
import { ROUTED_DOCUMENTS, ROUTING_COST_USD, ROUTING_MODEL } from "@/data/routing";
import { links } from "@/links";

const SAVED = Math.round((1 - ROUTING_COST_USD.routed / ROUTING_COST_USD.vision) * 100);

export function Features() {
  return (
    <Section
      id="features"
      eyebrow="What it does"
      title="Read it. Compare it. Expect it. Follow it."
      lead="Ingestion decides what your model will ever see, and none of its failures raise an error: a table flattened into lines, a scan that loads as no text, a clause cut in half, an account number sent to a hosted model. Each of these is a page in the viewer."
    >
      <div className="flex flex-col gap-6">
        <FeatureRow
          label="Read"
          title="The document as your pipeline read it."
          points={[
            "Every page as text, with numbered lines",
            "A splitter's chunks drawn over the text",
            "Each identifier masked and marked where it sits",
          ]}
          more={{ label: "The viewer", href: links.viewerGuide }}
          visual={
            <Screenshot
              src={{ dark: documentDark, light: documentLight }}
              ratio={1856 / 1168}
              alt="The viewer's reading of an employee record: numbered lines, two chunks drawn over the text, and each identifier masked and underlined where it sits"
            />
          }
        >
          What a loader returns is rarely what the page shows. See the text your model would be given, where each
          chunk starts and ends, and what was found in it.
        </FeatureRow>

        <FeatureRow
          flip
          label="Compare"
          title="Two loaders, the same page, line by line."
          points={[
            "Any two loaders or readers, side by side or unified",
            "What one keeps that another drops or splices",
            "A loader named for each file type",
          ]}
          more={{ label: "Comparing loaders", href: links.compareLoaders }}
          visual={
            <Recording
              video={{ light: diffLight, dark: diffDark }}
              poster={{ light: diffLightPoster, dark: diffDarkPoster }}
              label="A recording of the viewer: the diff of two loaders on a two-column page of a services agreement. One reads each clause whole; the other reads straight across both columns and splices two clauses into one sentence"
            />
          }
        >
          Loaders get chosen without checking what they extract. On a two-column page, one of these two reads each
          clause whole and the other reads straight across both columns. Run several on your own documents and read
          the difference.
        </FeatureRow>

        <FeatureRow
          label="Expect"
          title="Mark what a reading must keep, where you read it."
          points={[
            "Select a passage and press Expect",
            "Every reader and loader scored on your passages",
            "A lost passage shown beside what came out instead",
          ]}
          more={{ label: "Evals on your own documents", href: links.evals }}
          visual={
            <Recording
              video={{ light: expectLight, dark: expectDark }}
              poster={{ light: expectLightPoster, dark: expectDarkPoster }}
              label="A recording of the viewer: a clause is selected in a document with the mouse, Expect this passage is pressed, and the Evals page scores two readers on four expected passages"
            />
          }
        >
          A total, a clause, a row of a table: the passages your documents must come out with become the test every
          change to the pipeline has to pass.
        </FeatureRow>

        <FeatureRow
          flip
          label="Follow"
          title="Ask where a value went."
          points={[
            "Every document it was read from",
            "Every step that still held it, and the one that stopped it",
            "Every host it was sent to",
          ]}
          more={{ label: "Find where a value went", href: links.findValue }}
          visual={
            <Recording
              video={{ light: findLight, dark: findDark }}
              poster={{ light: findLightPoster, dark: findDarkPoster }}
              label="A recording of the viewer: an account number typed into Find a value, found in three runs, stopped by a masking step in one pipeline run and sent to a host in the other"
            />
          }
        >
          Type an account number or an email address and get its path through every run: loaded here, masked there,
          embedded and sent to a host in the run where nothing masked it. The value itself is hashed to search and
          written nowhere.
        </FeatureRow>

        <FeatureRow
          label="Protect"
          title="Identifiers and hidden instructions, before they are indexed."
          points={[
            "Personal and financial identifiers, by kind and by document",
            "Text a reader cannot see and a model can",
            "Masked in your pipeline or in copies of the files",
          ]}
          more={{ label: "Identifiers it finds", href: links.identifiers }}
          visual={
            <Screenshot
              src={{ dark: securityDark, light: securityLight }}
              ratio={1856 / 2018}
              alt="The viewer's Security page: counts by severity, one hidden instruction, and the identifiers found by kind, by document and by how sure the finding is"
            />
          }
        >
          Documents carry account numbers, national identifiers and, sometimes, text written for the model that
          reads them and not for a person. Both are found on your machine and linked to their page.
        </FeatureRow>

        <FeatureRow
          flip
          label="Route"
          title="Send a page to a vision model only when it needs one."
          points={[
            "The text layer where it is usable",
            "Local OCR for a readable scan",
            `${SAVED}% less than every page as an image, on these samples`,
          ]}
          more={{ label: "Page routing", href: links.routing }}
          visual={
            <div className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">
                33 pages of 6 sample documents, priced on {ROUTING_MODEL}. Hover a page for its reason.
              </p>
              <RouteMap documents={ROUTED_DOCUMENTS} />
              <RouteLegend />
            </div>
          }
        >
          A vision model handles any layout and costs the most. The router gives each page a route and the reason
          for it, and writes a plan your ingestion job reads.
        </FeatureRow>
      </div>
    </Section>
  );
}
