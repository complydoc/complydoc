import azure from "@/assets/tools/azure.svg?url";
import docling from "@/assets/tools/docling.svg?url";
import langchain from "@/assets/tools/langchain.svg?url";
import llamaindex from "@/assets/tools/llamaindex.svg?url";
import unstructured from "@/assets/tools/unstructured.svg?url";

/**
 * The mark of whatever read or handled a document: a loader, a parser, an OCR engine, a
 * LangChain or LlamaIndex component, or a model provider's client. Bundled, never fetched,
 * like the provider logos. A reader with no mark of its own gets a plain file icon, so a
 * column of readers lines up whatever each one is.
 */
export const MARKS: [RegExp, string, string][] = [
  [/docling/i, docling, "Docling"],
  [/unstructured/i, unstructured, "Unstructured"],
  [/azure|document.?intelligence/i, azure, "Azure"],
  [/llama|simpledirectory/i, llamaindex, "LlamaIndex"],
  [/loader$|splitter$|langchain/i, langchain, "LangChain"],
];

/** Clients named after the provider they call, such as OpenAIEmbeddings. */
export const PROVIDERS: [RegExp, string][] = [
  [/openai/i, "openai"],
  [/anthropic|claude/i, "anthropic"],
  [/gemini|google/i, "google"],
  [/mistral/i, "mistral"],
  [/deepseek/i, "deepseek"],
  [/xai|grok/i, "xai"],
];

/** Whether `name` has a mark of its own, rather than the plain file icon. */
export function hasToolMark(name: string): boolean {
  return /^complydoc\b/i.test(name) || [...PROVIDERS, ...MARKS].some(([pattern]) => pattern.test(name));
}
