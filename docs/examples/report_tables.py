"""Read a report as pandas tables."""

import complydoc as cd

report = cd.full_audit("src/complydoc/sample", ocr=False, extracted_text=True)

documents = report.to_pandas("documents")
print(documents[["document", "readiness_score", "identifiers", "hidden_passages"]])

hidden = report.to_pandas("hidden")
print(hidden[["document", "visibility", "instruction", "severity"]])
