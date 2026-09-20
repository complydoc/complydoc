"""Visibility and instruction evidence, combined into findings.

A passage is reported when it is hidden, when it reads as an instruction, or
both. Its severity comes from the combination:

| Visibility | Instruction | Severity |
| --- | --- | --- |
| hidden | pattern or confirmed | high |
| hidden, confirmed | model | high |
| hidden, suspected | model | medium |
| hidden | none | medium |
| visible or not measured | confirmed | medium |
| visible or not measured | pattern or model | low |

Excerpts go through the identifier scan and are masked like every other value
in a report, unless the run used `reveal`.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

from complydoc.config.schema import Config
from complydoc.hidden.instructions import (
    InstructionMatch,
    InstructionMatcher,
    classifier_score,
    matcher_for,
    registered_classifier,
)
from complydoc.hidden.markup import (
    eml_hidden_runs,
    html_hidden_runs,
    markdown_hidden_runs,
    pptx_hidden_runs,
)
from complydoc.hidden.office import docx_hidden_runs, xlsx_hidden_runs
from complydoc.hidden.unicode import find_smuggled, strip_invisible
from complydoc.hidden.visibility import HiddenRun, pdf_hidden_runs
from complydoc.report.models import ContentFinding

__all__ = ["ContentCheck", "check_content", "instruction_spans", "severity_of"]

_EXCERPT = 240
_PARAGRAPH = 2000
_IMAGES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
_BOUNDARY = re.compile(r"(?<=[.!?])\s+|\n")
_PARAGRAPH_BREAK = re.compile(r"\n\s*\n")


def severity_of(visibility: str, instruction: str) -> str:
    hidden = visibility in ("suspected", "confirmed")
    if hidden and instruction in ("pattern", "confirmed"):
        return "high"
    if hidden and instruction == "model":
        return "high" if visibility == "confirmed" else "medium"
    if hidden:
        return "medium"
    if instruction == "confirmed":
        return "medium"
    return "low"


@dataclass(frozen=True, slots=True)
class ContentCheck:
    findings: list[ContentFinding] = field(default_factory=list)
    visibility_checked: bool = False
    """False when there was no file, or no way, to check visibility against."""
    note: str | None = None


@dataclass(frozen=True, slots=True)
class _Reading:
    """What every pass over a page needs, gathered once for the whole check."""

    config: Config
    reveal: bool
    matcher: InstructionMatcher
    threshold: float
    minimum: int
    """Letters a passage needs before it is worth reporting."""
    hidden_texts: list[str]
    """The file's hidden runs, compacted, so a passage is not reported twice."""
    loader_text: bool
    given: str
    """What the loader handed over, when `loader_text`; used to say whether a
    hidden passage survived into it."""

    def seen_already(self, text: str) -> bool:
        """Whether this text was already reported as a hidden run of the file."""
        return any(_compact(text) in hidden for hidden in self.hidden_texts)

    def in_loader_output(self, text: str | None = None) -> bool | None:
        """Whether the loader's text holds this passage, or None if there is no loader."""
        if not self.loader_text:
            return None
        return True if text is None else _compact(text) in self.given


def check_content(
    path: Path | None,
    pages: Sequence[tuple[int, str]],
    config: Config,
    *,
    reveal: bool = False,
    password: str = "",
    loader_text: bool = False,
) -> ContentCheck:
    """Hidden passages in the file at `path`, and instruction-like text in `pages`.

    `pages` is the text a model would be given, as (page number, text). With
    `loader_text`, it came from another framework's loader, and each hidden
    passage records whether that text contains it.

    Four passes, in the order a reader of the report meets them: what the file's
    own formatting hides, what invisible characters smuggle in, what the
    instruction patterns match in the visible text, and what a registered
    classifier makes of the paragraphs the patterns did not already cover.
    """
    runs, notes, checked, unchecked = _file_runs(path, config, password)
    reading = _Reading(
        config=config,
        reveal=reveal,
        matcher=matcher_for(config.hidden.instructions),
        threshold=config.hidden.instructions.classifier_threshold,
        minimum=config.hidden.visibility.min_characters,
        hidden_texts=[_compact(run.text) for run in runs],
        loader_text=loader_text,
        given=_compact("\n".join(text for _, text in pages)) if loader_text else "",
    )

    findings = _hidden_by_formatting(runs, reading)
    for number, text in pages:
        if not text:
            continue
        measured = checked and number not in unchecked
        findings += _smuggled_in(number, text, reading)
        pattern_findings, covered = _matched_by_pattern(number, text, measured, reading)
        findings += pattern_findings
        findings += _scored_by_classifier(number, text, measured, covered, reading)

    return ContentCheck(findings, checked, "; ".join(notes) or None)


def _hidden_by_formatting(runs: list[HiddenRun], reading: _Reading) -> list[ContentFinding]:
    """Passages the file itself hides: white text, hidden styles, hidden sheets."""
    findings: list[ContentFinding] = []
    for run in runs:
        text = strip_invisible(run.text)
        score = classifier_score(text)
        instruction, reasons = _instruction(reading.matcher.find(text), score, reading.threshold)
        if run.only_if_instruction and instruction == "none":
            continue
        findings.append(
            _finding(
                run.page,
                run.visibility,
                instruction,
                text,
                reading.config,
                reading.reveal,
                hidden_reasons=run.reasons,
                instruction_reasons=reasons,
                score=score,
                in_loader_output=reading.in_loader_output(run.text),
            )
        )
    return findings


def _smuggled_in(number: int, text: str, reading: _Reading) -> list[ContentFinding]:
    """Passages carried by characters a reader never sees at all.

    Unicode tag characters spell out text that renders as nothing; a long run of
    zero-width characters hides a break; a bidirectional override displays text
    in an order other than the one a model reads.
    """
    findings: list[ContentFinding] = []
    in_output = reading.in_loader_output()

    for smuggled in find_smuggled(text, reading.config.hidden.visibility.zero_width_run):
        if smuggled.kind == "tag_characters":
            if _letters(smuggled.text) < reading.minimum:
                continue
            findings.append(
                _finding(
                    number,
                    "confirmed",
                    "confirmed",
                    smuggled.text,
                    reading.config,
                    reading.reveal,
                    hidden_reasons=["invisible Unicode tag characters"],
                    instruction_reasons=[
                        "decoded from invisible Unicode tag characters",
                        *_labels(reading.matcher.find(smuggled.text)),
                    ],
                    in_loader_output=in_output,
                )
            )
        elif smuggled.kind == "zero_width_run":
            around = strip_invisible(text[max(0, smuggled.start - 60) : smuggled.end + 60])
            findings.append(
                _finding(
                    number,
                    "confirmed",
                    "none",
                    around,
                    reading.config,
                    reading.reveal,
                    hidden_reasons=[
                        f"{smuggled.end - smuggled.start} zero-width characters in a row"
                    ],
                    in_loader_output=in_output,
                )
            )
        else:
            instruction, reasons = _instruction(
                reading.matcher.find(smuggled.text), None, reading.threshold
            )
            findings.append(
                _finding(
                    number,
                    "suspected",
                    instruction,
                    smuggled.text,
                    reading.config,
                    reading.reveal,
                    hidden_reasons=["bidirectional override: displayed in a different order"],
                    instruction_reasons=reasons,
                    in_loader_output=in_output,
                )
            )
    return findings


def _matched_by_pattern(
    number: int, text: str, measured: bool, reading: _Reading
) -> tuple[list[ContentFinding], list[tuple[int, int]]]:
    """Instruction patterns in the visible text, and the spans they covered.

    The spans go to the classifier pass, which has nothing to add about a
    passage the patterns already reported.
    """
    findings: list[ContentFinding] = []
    covered: list[tuple[int, int]] = []
    stripped = strip_invisible(text)

    for start, end, labels, matched in _grouped(reading.matcher.find(stripped), stripped):
        if all(reading.seen_already(part) for part in matched):
            continue
        excerpt = stripped[start:end]
        score = classifier_score(excerpt)
        covered.append((start, end))
        findings.append(
            _finding(
                number,
                "visible" if measured else "not_measured",
                "pattern",
                excerpt,
                reading.config,
                reading.reveal,
                instruction_reasons=labels
                + ([f"classifier score {score:.2f}"] if score is not None else []),
                score=score,
                in_loader_output=reading.in_loader_output(),
            )
        )
    return findings, covered


def _scored_by_classifier(
    number: int,
    text: str,
    measured: bool,
    covered: list[tuple[int, int]],
    reading: _Reading,
) -> list[ContentFinding]:
    """Paragraphs a registered classifier reads as instructions.

    This is what catches wording no pattern covers. Without a classifier
    registered there is nothing to ask, and the pass does nothing.
    """
    if registered_classifier() is None:
        return []

    findings: list[ContentFinding] = []
    stripped = strip_invisible(text)
    for start, end in _paragraphs(stripped):
        if any(start < right and left < end for left, right in covered):
            continue
        paragraph = stripped[start:end]
        if _letters(paragraph) < reading.minimum or reading.seen_already(paragraph):
            continue
        score = classifier_score(paragraph)
        if score is None or score < reading.threshold:
            continue
        findings.append(
            _finding(
                number,
                "visible" if measured else "not_measured",
                "model",
                paragraph,
                reading.config,
                reading.reveal,
                instruction_reasons=[f"classifier score {score:.2f}"],
                score=score,
                in_loader_output=reading.in_loader_output(),
            )
        )
    return findings


def instruction_spans(text: str, config: Config) -> list[tuple[int, int]]:
    """Start and end of each sentence in `text` that matches an instruction pattern."""
    matcher = matcher_for(config.hidden.instructions)
    return [(start, end) for start, end, _labels, _parts in _grouped(matcher.find(text), text)]


def _file_runs(
    path: Path | None, config: Config, password: str
) -> tuple[list[HiddenRun], list[str], bool, set[int]]:
    if path is None or not path.is_file():
        return [], ["there is no file to check the text against"], False, set()
    suffix = path.suffix.lower()
    visibility = config.hidden.visibility
    try:
        if suffix == ".pdf":
            runs, notes, unchecked, ok = pdf_hidden_runs(path, visibility, password)
            return runs, notes, ok, unchecked
        if suffix == ".docx":
            runs, notes, ok = docx_hidden_runs(path, visibility)
            return runs, notes, ok, set()
        if suffix in (".xlsx", ".xlsm"):
            runs, notes, ok = xlsx_hidden_runs(path, visibility)
            return runs, notes, ok, set()
        if suffix == ".pptx":
            runs, notes, ok = pptx_hidden_runs(path, visibility)
            return runs, notes, ok, set()
        if suffix in (".html", ".htm"):
            runs, notes, ok = html_hidden_runs(path, visibility)
            return runs, notes, ok, set()
        if suffix in (".md", ".markdown"):
            runs, notes, ok = markdown_hidden_runs(path, visibility)
            return runs, notes, ok, set()
        if suffix == ".eml":
            runs, notes, ok = eml_hidden_runs(path, visibility)
            return runs, notes, ok, set()
        if suffix == ".txt":
            # Plain text has no formatting to hide text with. Invisible Unicode is
            # checked on the text itself, below.
            return [], [], True, set()
        if suffix in _IMAGES:
            # An image has no text layer to hide text in; what OCR reads is on the page.
            return [], [], True, set()
    # Each check reopens the file with a third-party parser. A failure leaves the
    # file unchecked and says so, rather than ending the scan.
    except Exception as exc:
        return [], [f"the hidden-text check failed ({type(exc).__name__}: {exc})"], False, set()
    kind = f"{suffix} files" if suffix else "files without an extension"
    return [], [f"hidden text is not checked in {kind}"], False, set()


def _letters(text: str) -> int:
    return sum(c.isalnum() for c in text)


def _compact(text: str) -> str:
    return re.sub(r"\s+", "", strip_invisible(text)).casefold()


def _labels(matches: list[InstructionMatch]) -> list[str]:
    return list(dict.fromkeys(match.label for match in matches))


def _instruction(
    matches: list[InstructionMatch], score: float | None, threshold: float
) -> tuple[str, list[str]]:
    labels = _labels(matches)
    reasons = labels + ([f"classifier score {score:.2f}"] if score is not None else [])
    if labels:
        return "pattern", reasons
    if score is not None and score >= threshold:
        return "model", reasons
    return "none", reasons


def _sentence(text: str, start: int, end: int) -> tuple[int, int]:
    left = 0
    for boundary in _BOUNDARY.finditer(text, 0, start):
        left = boundary.end()
    after = _BOUNDARY.search(text, end)
    right = after.start() if after else len(text)
    if right - left > _EXCERPT:
        left = max(left, start - 80)
        right = min(right, max(end, left + _EXCERPT))
    return left, right


def _grouped(
    matches: list[InstructionMatch], text: str
) -> list[tuple[int, int, list[str], list[str]]]:
    """Matches in the same sentence, as one passage."""
    groups: dict[tuple[int, int], tuple[list[str], list[str]]] = {}
    for match in matches:
        labels, parts = groups.setdefault(_sentence(text, match.start, match.end), ([], []))
        if match.label not in labels:
            labels.append(match.label)
        parts.append(text[match.start : match.end])
    return [(start, end, labels, parts) for (start, end), (labels, parts) in sorted(groups.items())]


def _paragraphs(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    position = 0
    for boundary in [*_PARAGRAPH_BREAK.finditer(text), None]:
        end = boundary.start() if boundary else len(text)
        for start in range(position, end, _PARAGRAPH):
            spans.append((start, min(end, start + _PARAGRAPH)))
        position = boundary.end() if boundary else len(text)
    return spans


def _finding(
    page: int | None,
    visibility: str,
    instruction: str,
    text: str,
    config: Config,
    reveal: bool,
    *,
    hidden_reasons: Sequence[str] = (),
    instruction_reasons: Sequence[str] = (),
    score: float | None = None,
    in_loader_output: bool | None = None,
) -> ContentFinding:
    clean = " ".join(text.split())
    excerpt = _masked(clean[: _EXCERPT * 2], config, reveal)
    if len(excerpt) > _EXCERPT:
        excerpt = excerpt[: _EXCERPT - 1].rstrip() + "…"
    return ContentFinding(
        page=page,
        visibility=visibility,
        instruction=instruction,
        severity=severity_of(visibility, instruction),
        excerpt=excerpt,
        characters=len(clean),
        hidden_reasons=list(hidden_reasons),
        instruction_reasons=list(instruction_reasons),
        score=score,
        in_loader_output=in_loader_output,
    )


def _masked(text: str, config: Config, reveal: bool) -> str:
    if reveal or not text.strip():
        return text
    # Imported here: extract builds on the audit, which builds on this module.
    from complydoc.extraction.extract import mask_matches
    from complydoc.sensitive.scanner import scan_text

    matches, _unavailable = scan_text(text, config.sensitive, reveal=False)
    return mask_matches(text, matches)[0]
