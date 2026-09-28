import type { StageIdentifier, Trace, TraceStage } from "@/report/traceTypes";
import type { Report } from "@/report/types";
import { sampleAudit } from "./sample";

export function identifier(fingerprint: string, overrides: Partial<StageIdentifier> = {}): StageIdentifier {
  return {
    fingerprint,
    label: "IBAN",
    masked: "•••• 4432",
    severity: "high",
    occurrences: 1,
    evidence: "confirmed",
    ...overrides,
  };
}

export function stage(index: number, overrides: Partial<TraceStage> = {}): TraceStage {
  return {
    index,
    kind: "load",
    component: "PyPDFLoader",
    module: "langchain_community.document_loaders.pdf",
    method: "load",
    seconds: 0.1,
    tags: [],
    parameters: {},
    documents_in: null,
    documents_out: 2,
    characters_in: null,
    characters_out: 1000,
    sources: ["contract.pdf"],
    scanned: "full",
    identifiers: [],
    hidden: 0,
    metadata_keys: ["source", "page"],
    metadata_keys_added: [],
    path_keys: [],
    connections: [],
    hosts: [],
    vectors: null,
    dimensions: null,
    chunks: null,
    finished: true,
    error: null,
    ...overrides,
  };
}

const iban = identifier("id-iban");
const name = identifier("id-name", { label: "Person name", masked: "••• Doe", severity: "medium", evidence: "model" });

/**
 * Two files loaded one call each, paths stripped, split, and embedded by a model that
 * reached a host: the account number reaches the host; the name, found by the name model,
 * is not looked for by the splitter's patterns.
 */
export function sampleTrace(): Trace {
  return {
    name: "contracts-ingest",
    scan: "patterns",
    seconds: 1.5,
    overhead_seconds: 0.4,
    connections_outside: [],
    libraries: { "langchain-core": "1.6.3" },
    error: null,
    stages: [
      stage(0, { parameters: { file_path: "a.pdf", mode: "page" }, identifiers: [iban, name], path_keys: ["source"] }),
      stage(1, { parameters: { file_path: "b.pdf", mode: "page" } }),
      stage(2, {
        kind: "transform",
        component: "StripPathMetadata",
        method: "transform_documents",
        documents_in: 4,
        documents_out: 4,
        characters_in: 2000,
        characters_out: 2000,
        identifiers: [iban],
        scanned: "patterns",
      }),
      stage(3, {
        kind: "split",
        component: "RecursiveCharacterTextSplitter",
        method: "split_documents",
        parameters: { chunk_size: 400, chunk_overlap: 0 },
        documents_in: 4,
        documents_out: 9,
        characters_in: 2000,
        characters_out: 2000,
        identifiers: [iban],
        scanned: "patterns",
        chunks: 0,
      }),
      stage(4, {
        kind: "embed",
        component: "OpenAIEmbeddings",
        method: "embed_documents",
        parameters: { model: "text-embedding-3-small" },
        documents_in: 9,
        documents_out: null,
        characters_in: 2000,
        characters_out: null,
        identifiers: [iban, name],
        metadata_keys: [],
        connections: ["DNS lookup of 'api.example.com'"],
        hosts: ["api.example.com"],
        vectors: 9,
        dimensions: 1536,
      }),
    ],
  };
}

export function traceReport(): Report {
  return { ...sampleAudit(), trace: sampleTrace() };
}

/**
 * A directory loader that ran a loader for each of two files, then a split and a priced
 * embedding call, each placed in time, with previews of what it sent.
 */
export function nestedTrace(): Trace {
  const base = sampleTrace();
  return {
    ...base,
    stages: [
      stage(0, {
        component: "DirectoryLoader",
        parameters: { path: "contracts" },
        documents_out: 4,
        started: 0,
        seconds: 0.5,
      }),
      stage(1, { parent: 0, parameters: { file_path: "a.pdf" }, started: 0, seconds: 0.2, identifiers: [iban] }),
      stage(2, { parent: 0, parameters: { file_path: "b.pdf" }, started: 0.2, seconds: 0.3 }),
      stage(3, {
        kind: "split",
        component: "RecursiveCharacterTextSplitter",
        method: "split_documents",
        parameters: { chunk_size: 400 },
        documents_in: 4,
        documents_out: 9,
        started: 0.5,
        seconds: 0.1,
        identifiers: [iban],
        scanned: "patterns",
      }),
      stage(4, {
        kind: "embed",
        component: "OpenAIEmbeddings",
        method: "embed_documents",
        parameters: { model: "text-embedding-3-small" },
        documents_in: 9,
        documents_out: null,
        started: 0.6,
        seconds: 0.4,
        tokens_in: 1200,
        usd: 0.000024,
        usd_basis: "estimated",
        identifiers: [iban],
        connections: ["DNS lookup of 'api.example.com'"],
        hosts: ["api.example.com"],
        vectors: 9,
        dimensions: 1536,
        previews: [
          {
            source: null,
            page: null,
            characters: 40,
            tokens: 10,
            text: "Payments go to account •••• 4432",
            metadata: {},
          },
        ],
      }),
    ],
  };
}

export function nestedReport(): Report {
  return { ...sampleAudit(), trace: nestedTrace() };
}
