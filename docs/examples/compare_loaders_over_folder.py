"""Compare two settings of one LangChain loader over a folder, with expected facts."""

# requires: langchain_pymupdf4llm

import functools

from langchain_pymupdf4llm import PyMuPDF4LLMLoader

import complydoc as cd

report = cd.compare_loaders(
    {
        "layout": PyMuPDF4LLMLoader,
        "no-layout": functools.partial(PyMuPDF4LLMLoader, use_layout=False),
    },
    paths=[
        "src/complydoc/sample/employee-record.pdf",
        "src/complydoc/sample/vendor-assessment.pdf",
    ],
    facts=[
        cd.Fact(
            "Two administrator accounts have no multi-factor authentication",
            document="vendor-assessment.pdf",
        ),
    ],
)

for row in report.loader_comparison.loaders:
    print(
        f"{row.name:<10} documents {row.documents}  failed {len(row.failures)}  "
        f"facts found {row.facts_found}"
    )

for check in report.loader_comparison.facts:
    print(check.fact, check.found)
