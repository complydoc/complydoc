"""Compare what two LangChain PDF loaders extract from the same file."""

from langchain_community.document_loaders import PDFPlumberLoader, PyPDFLoader

import complydoc as cd

path = "src/complydoc/sample/employee-record.pdf"
report = cd.compare_loaders({"pypdf": PyPDFLoader(path), "pdfplumber": PDFPlumberLoader(path)})

comparison = report.loader_comparison
for row in comparison.loaders:
    print(
        f"{row.name:<11} {row.characters:>6,} characters  "
        f"{row.identifiers_in_text:>2} identifiers in text  "
        f"{len(row.metadata_keys):>2} metadata keys  "
        f"network attempts: {len(row.network_attempts)}"
    )

for document in report.documents:
    for reading in document.extractions[1:]:
        print(
            f"\n{document.relative_path}: {reading.extractor} matches the baseline "
            f"{reading.similarity:.0%}"
        )

for difference in comparison.identifier_differences:
    where = "text" if difference.location == "text" else f"metadata ({', '.join(difference.keys)})"
    print(
        f"{difference.label} in {where}: found by {', '.join(difference.found_by)}, "
        f"missed by {', '.join(difference.missed_by)}"
    )

cd.write_html(report, "loaders.html")
