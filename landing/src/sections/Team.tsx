import { FileCogIcon } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { FeatureRow } from "@/components/FeatureRow";
import { Section } from "@/components/Section";
import { TeamDiagram } from "@/components/TeamDiagram";
import { links } from "@/links";

/** A policy as `complydoc check` reads it, from the policy guide. */
const POLICY = `version: 1
rules:
  no_hidden:
    severity: medium
  no_identifiers_sent:
    severity: high
  no_network: true
  no_regressions:
    baseline: baseline.json`;

export function Team() {
  return (
    <Section
      id="team"
      eyebrow="For a team"
      title="From one laptop to every run your team makes."
      lead="The same reports, written by your pipelines and CI jobs, read by everyone who should see them and enforced where code is merged."
    >
      <div className="flex flex-col gap-6">
        <FeatureRow
          label="Share"
          title="One place where the whole team reads the same runs."
          points={[
            "A container that serves the viewer, read-only",
            "Behind the sign-in you already have",
            "Reports in a shared folder or your own bucket",
          ]}
          more={{ label: "Run it for your team", href: links.team }}
          visual={<TeamDiagram />}
        >
          Runs from every machine and CI job land in one folder, each with the commit it came from. Nothing leaves
          your infrastructure, and complydoc has no accounts of its own.
        </FeatureRow>
        <FeatureRow
          flip
          label="Enforce"
          title="Fail the build when ingestion gets worse."
          points={[
            "No hidden instructions, no identifier sent to a host",
            "Nothing worse than the last run",
            "One command, or a GitHub Action on the pull request",
          ]}
          more={{ label: "Policy files", href: links.policy }}
          visual={
            <CodeBlock
              title="complydoc check ./documents --policy policy.yaml"
              icon={<FileCogIcon className="size-3.5" />}
              lang="yaml"
              code={POLICY}
            />
          }
        >
          A policy file holds a folder or a recorded pipeline to rules, checks them all in one run and exits
          non-zero, listing every document and page that broke one.
        </FeatureRow>
      </div>
    </Section>
  );
}
