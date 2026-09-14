"""Add a detector and a readiness signal, and configure both in code."""

import re

import complydoc as cd


class EmployeeIdDetector:
    id = "employee_id"

    def find(self, text, context):
        return [cd.Finding(m.start(), m.end()) for m in re.finditer(r"\bEMP-\d{6}\b", text)]


class UppercaseSignal:
    id = "uppercase_share"
    name = "Uppercase words"
    unit = "% of words"
    why = "Text in capitals is often a heading or a label."
    applies_to = frozenset(cd.DocumentFormat)

    def measure(self, document):
        words = document.full_text.split()
        if not words:
            return cd.Measurement.na("no words")
        share = sum(1 for w in words if w.isupper() and len(w) > 1) / len(words) * 100
        return cd.Measurement(value=round(share, 2), display=f"{share:.1f}%")


cd.register_detector(EmployeeIdDetector())
cd.register_signal(UppercaseSignal())

config = cd.load_config().override(
    {
        "sensitive.categories.employee_id": {
            "label": "Employee ID",
            "detector": "employee_id",
            "severity": "medium",
        },
        "readiness.signals.uppercase_share": {
            "weight": 0.01,
            "direction": "lower_is_better",
            "thresholds": {"good": {"lt": 20}, "fair": {"lt": 50}, "poor": {"gte": 50}},
        },
        "readiness.signals.table_count.enabled": False,
    }
)

print([m.label for m in cd.scan_text("Badge EMP-004211 issued.", config=config).matches])

report = cd.readiness_audit("src/complydoc/sample/employee-record.pdf", config=config)
signal = next(s for s in report.documents[0].readiness.signals if s.id == "uppercase_share")
print(signal.name, signal.display, signal.rating)
