/** What sending a folder to a model costs, and the route each page needs. */

export interface PageRoute {
  number: number;
  route: "text" | "ocr" | "vision";
  reason: string;
}

export type CostPath = "text_layer" | "text_ocr" | "vision";

/** What sending the folder to a model costs one way. Null where the path serves no document. */
export interface Architecture {
  key: CostPath;
  label: string;
  per_1000_usd: number | null;
  folder_usd: number | null;
  documents_served: number;
  documents_total: number;
}

export interface ModelCost {
  model_id: string;
  display_name: string;
  provider: string;
  architectures: Architecture[];
  /** Schema 16: what pricing one page takes. */
  input_per_mtok_usd?: number | null;
  supports_vision?: boolean;
  vision_formula?: string | null;
  tokenizer?: string;
}

export interface Cost {
  currency: string;
  models: ModelCost[];
  /** Schema 16: the date of the oldest price used, as ISO. */
  prices_as_of?: string | null;
}
