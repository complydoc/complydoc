/**
 * A span's input and output as YAML lines, the way traces are read: short values inline,
 * text as a block. What a step passed on is shown from its previews, masked as the run
 * kept them; what it was given, where no preview of it was kept, as counts.
 */
import type { StagePreview, TraceStage } from "./traceTypes";

/** Settings that name what a loader read. */
const SOURCES = ["file_path", "path", "web_path", "input_dir", "input_files", "glob", "urls", "bucket", "key"];

/** A value on one line, quoted where YAML would read it as something else. */
function scalar(value: string | number | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  return /^[\w./@ -]*$/.test(value) && value.trim() === value && value !== "" ? value : JSON.stringify(value);
}

function block(key: string, text: string, indent: string): string[] {
  const lines = text.replace(/\s+$/, "").split("\n");
  return [`${indent}${key}: |`, ...lines.map((line) => `${indent}  ${line}`)];
}

function preview(item: StagePreview): string[] {
  const fields = [
    ...(item.source !== null ? [`source: ${scalar(item.source)}`] : []),
    ...(item.page !== null ? [`page: ${item.page}`] : []),
    ...(item.tokens !== null ? [`tokens: ${scalar(item.tokens)}`] : []),
    `characters: ${scalar(item.characters)}`,
  ];
  const keys = Object.entries(item.metadata);
  if (keys.length > 0) fields.push("metadata:", ...keys.map(([key, value]) => `  ${key}: ${scalar(value)}`));
  fields.push(...block("text", item.text || "", ""));
  // A list item: its first line marked, the rest under it.
  return fields.map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`));
}

/** What the step was given. An embedding step's input is the text it sent, previewed. */
export function inputLines(stage: TraceStage, from: string | null): string[] {
  if (stage.kind === "embed" && stage.previews?.length) {
    return [`texts: ${scalar(stage.documents_in)}`, ...(stage.previews ?? []).flatMap(preview)];
  }
  if (stage.documents_in === null) {
    // A loader is given no documents: what it reads is named in its settings.
    const read = Object.entries(stage.parameters).filter(
      ([key, value]) => SOURCES.includes(key) && value !== null && value !== "",
    );
    return read.length > 0
      ? read.map(([key, value]) => `${key}: ${typeof value === "string" ? scalar(value) : JSON.stringify(value)}`)
      : ["# no documents in; see Settings for what it read"];
  }
  return [
    `${stage.kind === "embed" ? "texts" : "documents"}: ${scalar(stage.documents_in)}`,
    ...(typeof stage.tokens_in === "number" ? [`tokens: ${scalar(stage.tokens_in)}`] : []),
    ...(stage.characters_in !== null ? [`characters: ${scalar(stage.characters_in)}`] : []),
    ...(from ? [`from: ${scalar(from)}`] : []),
  ];
}

/** What the step passed on: its previews, or for an embedding step, the vectors' shape. */
export function outputLines(stage: TraceStage): string[] {
  if (stage.kind === "embed")
    return [
      `vectors: ${scalar(stage.vectors)}`,
      ...(stage.dimensions !== null ? [`dimensions: ${stage.dimensions}`] : []),
    ];
  const unit = stage.kind === "split" ? "chunks" : stage.kind === "document" ? "pages" : "documents";
  const head = [
    ...(stage.documents_out !== null ? [`${unit}: ${scalar(stage.documents_out)}`] : []),
    ...(stage.characters_out !== null ? [`characters: ${scalar(stage.characters_out)}`] : []),
    ...(stage.kind === "scan" || stage.kind === "document" ? [`identifiers: ${stage.identifiers.length}`] : []),
    ...(typeof stage.tokens_out === "number" ? [`tokens: ${scalar(stage.tokens_out)}`] : []),
  ];
  const previews = stage.previews ?? [];
  if (previews.length === 0) return head;
  const shown = stage.documents_out !== null && stage.documents_out > previews.length;
  return [
    ...head,
    ...(shown ? [`# the first ${previews.length}, identifiers masked`] : []),
    "items:",
    ...previews.flatMap((item) => preview(item).map((line) => `  ${line}`)),
  ];
}
