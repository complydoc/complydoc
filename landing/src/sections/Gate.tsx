import { CodeBlock, Source } from "@/components/CodeBlock";
import { copyable } from "@/lib/code";
import { Section, TextLink } from "@/components/Section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { links, VERSION } from "@/links";

const POLICY = `version: 1
rules:
  no_hidden:
    severity: medium
  no_identifiers:
    severity: high
  readiness_at_least:
    score: 60
  no_network: true
  all_categories_scanned:
    level: warning
  no_regressions:
    baseline: baseline.json`;

const ACTION = `on:
  pull_request:
    paths: ["documents/**", "policy.yaml"]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: complydoc/complydoc@v${VERSION}
        with:
          path: documents
          policy: policy.yaml
          sarif: true      # failures in code scanning`;

const SHELL = `$ complydoc check ./documents --policy policy.yaml \\
    --markdown check.md --sarif check.sarif
$ complydoc diff baseline.json .complydoc/complydoc.json`;

const EXIT_CODES = [
  { code: "0", meaning: "Every error rule passed. Warnings may still be reported" },
  { code: "1", meaning: "An error rule failed" },
  { code: "2", meaning: "The policy, the path or the report could not be read" },
];

export function Gate() {
  return (
    <Section
      id="ci"
      label="in ci"
      title="Hold a folder to rules, on every pull request"
      lead="A policy file asks the same questions a Python test does. Every rule runs, so one run lists everything that failed, and the job exits non-zero when an error rule fails. A Markdown summary goes on the pull request and SARIF goes to code scanning."
    >
      <div className="grid gap-8 *:min-w-0 lg:grid-cols-[1.1fr_1fr]">
        <Tabs defaultValue="policy">
          <TabsList>
            <TabsTrigger value="policy">policy.yaml</TabsTrigger>
            <TabsTrigger value="action">GitHub Action</TabsTrigger>
            <TabsTrigger value="shell">Any CI</TabsTrigger>
          </TabsList>
          <TabsContent value="policy">
            <CodeBlock title="policy.yaml" copy={POLICY}>
              <Source code={POLICY} />
            </CodeBlock>
          </TabsContent>
          <TabsContent value="action">
            <CodeBlock title=".github/workflows/documents.yml" copy={ACTION}>
              <Source code={ACTION} />
            </CodeBlock>
          </TabsContent>
          <TabsContent value="shell">
            <CodeBlock title="shell" copy={copyable(SHELL)}>
              <Source code={SHELL} />
            </CodeBlock>
          </TabsContent>
        </Tabs>
        <div className="flex flex-col gap-6 lg:pt-10">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">exit</TableHead>
                  <TableHead>meaning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EXIT_CODES.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell className="whitespace-normal">{row.meaning}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono text-xs">no_regressions</code> compares against a saved report, so a new loader
            version or a changed splitter that reads worse fails the build before it reaches your index.{" "}
            <TextLink href={links.policy}>Policy files</TextLink> · <TextLink href={links.action}>GitHub Action</TextLink>
          </p>
        </div>
      </div>
    </Section>
  );
}
