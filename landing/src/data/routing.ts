// From `complydoc routing ./documents` on viewer/sample/documents (complydoc-routing.json),
// priced for Claude Sonnet 5 at medium resolution. Rerun it rather than editing this file.

export type Route = "text" | "ocr" | "vision";

export interface RoutedPage {
  page: number;
  route: Route;
  reason: string;
  characters: number;
}

export const ROUTING_MODEL = "Claude Sonnet 5";

export const ROUTING_COST_USD = {"routed": 0.047748, "text_layer": 0.035932, "text_ocr": 0.035932, "vision": 0.1056};

export const ROUTED_DOCUMENTS: { document: string; pages: RoutedPage[] }[] = [
  {
    "document": "annual-report-2025.pdf",
    "pages": [
      {
        "page": 1,
        "route": "text",
        "reason": "a text layer covering 48% of the page",
        "characters": 3838
      },
      {
        "page": 2,
        "route": "text",
        "reason": "a text layer covering 17% of the page",
        "characters": 1336
      },
      {
        "page": 3,
        "route": "vision",
        "reason": "a table with merged or stacked header cells, which plain text loses",
        "characters": 2412
      },
      {
        "page": 4,
        "route": "text",
        "reason": "a text layer covering 54% of the page",
        "characters": 4393
      },
      {
        "page": 5,
        "route": "text",
        "reason": "a text layer covering 54% of the page",
        "characters": 4401
      },
      {
        "page": 6,
        "route": "text",
        "reason": "a text layer covering 53% of the page",
        "characters": 4354
      },
      {
        "page": 7,
        "route": "text",
        "reason": "a text layer covering 53% of the page",
        "characters": 4368
      },
      {
        "page": 8,
        "route": "text",
        "reason": "a text layer covering 53% of the page",
        "characters": 4339
      }
    ]
  },
  {
    "document": "employee-handbook.pdf",
    "pages": [
      {
        "page": 1,
        "route": "text",
        "reason": "a text layer covering 51% of the page",
        "characters": 5143
      },
      {
        "page": 2,
        "route": "text",
        "reason": "a text layer covering 56% of the page",
        "characters": 5694
      },
      {
        "page": 3,
        "route": "text",
        "reason": "a text layer covering 56% of the page",
        "characters": 5631
      },
      {
        "page": 4,
        "route": "text",
        "reason": "a text layer covering 57% of the page",
        "characters": 5711
      },
      {
        "page": 5,
        "route": "text",
        "reason": "a text layer covering 17% of the page",
        "characters": 1759
      },
      {
        "page": 6,
        "route": "text",
        "reason": "a text layer covering 7% of the page",
        "characters": 549
      }
    ]
  },
  {
    "document": "master-services-agreement.pdf",
    "pages": [
      {
        "page": 1,
        "route": "text",
        "reason": "a text layer covering 27% of the page",
        "characters": 2053
      },
      {
        "page": 2,
        "route": "text",
        "reason": "a text layer covering 50% of the page",
        "characters": 4148
      },
      {
        "page": 3,
        "route": "text",
        "reason": "a text layer covering 50% of the page",
        "characters": 4165
      },
      {
        "page": 4,
        "route": "text",
        "reason": "a text layer covering 52% of the page",
        "characters": 4230
      },
      {
        "page": 5,
        "route": "text",
        "reason": "a text layer covering 52% of the page",
        "characters": 4298
      },
      {
        "page": 6,
        "route": "text",
        "reason": "a text layer covering 53% of the page",
        "characters": 4405
      },
      {
        "page": 7,
        "route": "text",
        "reason": "a text layer covering 14% of the page",
        "characters": 1195
      },
      {
        "page": 8,
        "route": "text",
        "reason": "a text layer covering 6% of the page",
        "characters": 451
      }
    ]
  },
  {
    "document": "rechnungen-2026-de.pdf",
    "pages": [
      {
        "page": 1,
        "route": "text",
        "reason": "a text layer covering 9% of the page",
        "characters": 582
      },
      {
        "page": 2,
        "route": "text",
        "reason": "a text layer covering 9% of the page",
        "characters": 583
      },
      {
        "page": 3,
        "route": "text",
        "reason": "a text layer covering 9% of the page",
        "characters": 580
      }
    ]
  },
  {
    "document": "supplier-invoices-scanned.pdf",
    "pages": [
      {
        "page": 1,
        "route": "vision",
        "reason": "a scan at 150 dpi, below the 200 OCR needs",
        "characters": 0
      },
      {
        "page": 2,
        "route": "vision",
        "reason": "a scan at 150 dpi, below the 200 OCR needs",
        "characters": 0
      },
      {
        "page": 3,
        "route": "vision",
        "reason": "a scan at 150 dpi, below the 200 OCR needs",
        "characters": 0
      }
    ]
  },
  {
    "document": "vendor-due-diligence.pdf",
    "pages": [
      {
        "page": 1,
        "route": "text",
        "reason": "a text layer covering 24% of the page",
        "characters": 1967
      },
      {
        "page": 2,
        "route": "text",
        "reason": "a text layer covering 15% of the page",
        "characters": 1361
      },
      {
        "page": 3,
        "route": "text",
        "reason": "a text layer covering 13% of the page",
        "characters": 1201
      },
      {
        "page": 4,
        "route": "text",
        "reason": "a text layer covering 14% of the page",
        "characters": 1217
      },
      {
        "page": 5,
        "route": "text",
        "reason": "a text layer covering 4% of the page",
        "characters": 283
      }
    ]
  }
];
