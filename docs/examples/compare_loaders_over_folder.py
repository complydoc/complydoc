"""Compare two LangChain loaders over a folder, with facts the documents should contain."""

from langchain_community.document_loaders import PDFPlumberLoader, PyPDFLoader

import complydoc as cd

report = cd.compare_loaders(
    {"pypdf": PyPDFLoader, "pdfplumber": PDFPlumberLoader},
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
        f"{row.name:<11} documents {row.documents}  failed {len(row.failures)}  "
        f"facts found {row.facts_found}"
    )

for check in report.loader_comparison.facts:
    print(check.fact, check.found)
