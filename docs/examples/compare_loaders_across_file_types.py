"""Compare loaders over a folder of PDFs and Word files, one file type at a time."""

# requires: langchain_community, docx2txt

from langchain_community.document_loaders import Docx2txtLoader, PDFPlumberLoader, PyPDFLoader

import complydoc as cd

# PyPDFLoader and PDFPlumberLoader are given the PDFs, Docx2txtLoader the Word file.
report = cd.compare_loaders(
    {"pypdf": PyPDFLoader, "pdfplumber": PDFPlumberLoader, "docx2txt": Docx2txtLoader},
    paths="src/complydoc/sample",
    facts=["Two administrator accounts have no multi-factor authentication"],
)

comparison = report.loader_comparison
for file_type in comparison.formats:
    skipped = ", ".join(file_type.skipped_by) or "none"
    print(f"{file_type.label} ({file_type.documents}), skipped by {skipped}")
    for row in file_type.loaders:
        print(f"  {row.name:<11} read {row.documents}, failed on {len(row.failures)}")
    print(f"  use {file_type.recommended or '—'}: {file_type.verdict}")

print(comparison.verdict)
cd.write_html(report, "loaders.html")
