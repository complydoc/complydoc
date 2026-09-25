import type { ReactNode } from "react";
import { CodeBlock, Faint } from "@/components/CodeBlock";

const FILES = [
  "annual-report-2025.pdf",
  "employee-handbook.pdf",
  "master-services-agreement.pdf",
  "rechnungen-2026-de.pdf",
  "supplier-invoices-scanned.pdf",
  "vendor-due-diligence.pdf",
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="grid grid-cols-[11rem_1fr] gap-2">
      <span className="whitespace-pre text-muted-foreground">{label}</span>
      <span className="whitespace-pre">{children}</span>
    </span>
  );
}

const good = "text-success";
const warn = "text-warning";
const bad = "text-destructive";

/**
 * What `complydoc audit` printed for the six sample documents the viewer ships
 * (viewer/sample/documents), with the price freshness notes left out. Nothing
 * here is invented: rerun it to update the figures.
 */
export function AuditOutput({ className }: { className?: string }) {
  return (
    <CodeBlock title="complydoc audit ./documents" copy="complydoc audit ./documents" className={className}>
      <span className="block">
        <Faint>$ </Faint>complydoc audit ./documents
      </span>
      {FILES.map((file, i) => (
        <span key={file} className="block">
          <Faint>
            ({i + 1}/{FILES.length}) {file}
          </Faint>
        </span>
      ))}
      <span className="mt-4 block" />
      <Row label="Documents">6 (33 pages)</Row>
      <Row label="Text path">$0.0025</Row>
      <Row label="Vision path">$0.0055</Row>
      <Row label="Readiness">
        75.4/100 <span className={good}>ready</span> <Faint>(Content, Cost path, Exposure)</Faint>
      </Row>
      <Row label="  Extraction">
        82.3/100 <Faint>(can the text be read off the page)</Faint>
      </Row>
      <Row label="Sensitive items">
        42 in 4/6 docs, <span className={warn}>2 categories not scanned</span>
      </Row>
      <Row label="Not scanned">
        Organisation name, Person name <Faint>— nothing was looked for, so no conclusion about these can be drawn.</Faint>
      </Row>
      <Row label="Hidden content">
        1 passage, <span className={bad}>1 high</span>
      </Row>
      <Row label="Unread pages">
        <span className={warn}>3</span> <Faint>(no OCR engine installed; complydoc doctor shows how to add one)</Faint>
      </Row>
      <span className="mt-4 block">6 important limitations — see the report before drawing conclusions.</span>
      <span className="mt-4 block" />
      <Row label="Report">
        <Faint>.complydoc/complydoc.html</Faint>
      </Row>
      <Row label="Data">
        <Faint>.complydoc/complydoc.json</Faint>
      </Row>
    </CodeBlock>
  );
}
