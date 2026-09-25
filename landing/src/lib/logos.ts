/**
 * Brand marks, inlined so the monochrome ones take the text colour.
 * From @lobehub/icons-static-svg (MIT), Docling's own repository (MIT) and
 * TypeSafe AI;
 * each belongs to its company and is shown only to say complydoc works with it.
 */
import anthropic from "@/assets/logos/anthropic.svg?raw";
import azure from "@/assets/logos/azure.svg?raw";
import deepseek from "@/assets/logos/deepseek.svg?raw";
import docling from "@/assets/logos/docling.svg?raw";
import gemini from "@/assets/logos/gemini.svg?raw";
import kimi from "@/assets/logos/kimi.svg?raw";
import langchain from "@/assets/logos/langchain.svg?raw";
import llamaindex from "@/assets/logos/llamaindex.svg?raw";
import mistral from "@/assets/logos/mistral.svg?raw";
import openai from "@/assets/logos/openai.svg?raw";
import typesafe from "@/assets/logos/typesafe.svg?raw";
import unstructured from "@/assets/logos/unstructured.svg?raw";
import xai from "@/assets/logos/xai.svg?raw";
import zai from "@/assets/logos/zai.svg?raw";

export const LOGOS = {
  anthropic,
  azure,
  deepseek,
  docling,
  gemini,
  kimi,
  langchain,
  llamaindex,
  mistral,
  openai,
  typesafe,
  unstructured,
  xai,
  zai,
} as const;

export type Brand = keyof typeof LOGOS;
