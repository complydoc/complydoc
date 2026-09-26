"""Compare a retired langchain-community loader with its standalone replacement."""

# requires: langchain_community, langchain_pymupdf4llm

from langchain_community.document_loaders import PyPDFLoader  # archived June 2026
from langchain_pymupdf4llm import PyMuPDF4LLMLoader

import complydoc as cd

path = "src/complydoc/sample/vendor-assessment.pdf"
report = cd.compare_loaders(
    {"pypdf": PyPDFLoader(path), "pymupdf4llm": PyMuPDF4LLMLoader(path)},
    facts=["Two administrator accounts have no multi-factor authentication"],
)

comparison = report.loader_comparison
for row in comparison.loaders:
    print(
        f"{row.name:<12} {row.characters:>6,} characters  "
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

for check in comparison.facts:
    print(check.fact, check.found)

cd.write_html(report, "loaders.html")
