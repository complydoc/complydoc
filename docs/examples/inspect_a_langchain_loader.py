"""Inspect what a LangChain loader extracted from a document."""

from langchain_community.document_loaders import PyPDFLoader

import complydoc as cd

report = cd.inspect_documents(PyPDFLoader("src/complydoc/sample/employee-record.pdf"))

loader = report.loader
print(f"{loader.name}: {loader.documents_returned} document(s) in {loader.seconds}s")
print(f"network attempts: {loader.network_attempts or 'none'}")
print(f"metadata keys: {', '.join(loader.metadata_keys)}")

for document in report.documents:
    print(f"\n{document.relative_path}")
    print(f"  identifiers in text: {len(document.sensitive.matches)}")
    for finding in document.metadata_findings:
        print(f"  in metadata: {finding.key} -> {finding.label} ({finding.evidence})")
    if document.path_exposures:
        print(f"  absolute paths in: {', '.join(document.path_exposures)}")

print()
for limitation in report.limitations:
    print(f"[{limitation.severity}] {limitation.area}: {limitation.statement}")

cd.write_html(report, "inspection.html")
