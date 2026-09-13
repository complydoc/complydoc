"""Audit a folder and read the headline numbers off the result."""

import complydoc as cd

report = cd.full_audit("src/complydoc/sample")

print(f"{report.overall.score}/100 — {report.overall.label}")
for factor in report.overall.factors:
    measured = factor.score if factor.measured else "not measured"
    print(f"  {factor.name:10} {measured}  (weight {factor.weight:.0%})")

print(f"\n{report.overall.bands}")

for win in report.quick_wins:
    print(f"[{win.actor}] {win.title} — {len(win.documents)} document(s)")

cd.write_html(report, "audit.html")
