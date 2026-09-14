"""What to do next, ranked, with what it would buy.

Each entry names the documents it applies to and who acts (`complydoc` or
`you`). Where the effect can be computed from the report, such as the cost of
the image path, it is. Entries do not predict a score.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from complydoc.report.models import AuditReport
from complydoc.text import count

__all__ = ["QuickWin", "quick_wins"]


@dataclass(frozen=True, slots=True)
class QuickWin:
    """One recommended action and the documents it applies to."""

    id: str
    title: str
    detail: str
    documents: list[str]
    actor: str
    """`complydoc` where the tool could do it, `you` where it cannot."""
    effect: str | None = None
    """The measured consequence, where there is one to measure."""
    saving_usd_per_1000: float | None = None
    """Only set where it follows from prices already in this report."""

    @property
    def affected(self) -> int:
        return len(self.documents)


@dataclass(slots=True)
class _Context:
    report: AuditReport
    wins: list[QuickWin] = field(default_factory=list)

    def add(
        self,
        *,
        id: str,
        title: str,
        detail: str,
        documents: list[str],
        actor: str,
        effect: str | None = None,
        saving_usd_per_1000: float | None = None,
    ) -> None:
        """Record a win, unless it applies to nothing.

        Every builder computes its list first and calls this unconditionally,
        so the empty case is handled here.
        """
        if not documents:
            return
        self.wins.append(
            QuickWin(
                id=id,
                title=title,
                detail=detail,
                documents=documents,
                actor=actor,
                effect=effect,
                saving_usd_per_1000=saving_usd_per_1000,
            )
        )


def _vision_saving_per_1000(report: AuditReport) -> float | None:
    """What one document costs on the image path over the text path.

    Taken from the headline model's own figures in this report, so the number
    a quick win quotes is the number the cost page shows.
    """
    from complydoc.report.charts import build_comparison, headline_comparison

    comparisons = build_comparison(report)
    headline = headline_comparison(comparisons, "claude-sonnet-5")
    if headline is None:
        return None
    text = headline.by_key("text_ocr")
    vision = headline.by_key("vision")
    if text is None or vision is None:
        return None
    if text.per_1000_usd is None or vision.per_1000_usd is None:
        return None
    return round(vision.per_1000_usd - text.per_1000_usd, 4)


def _no_text_layer(context: _Context) -> None:
    """Pages that yielded nothing have to be sent as images."""
    blank: list[str] = []
    for document in context.report.documents:
        if document.cost is None or not document.cost.pages:
            continue
        if any(page.text_source == "none" for page in document.cost.pages):
            blank.append(document.relative_path)

    saving = _vision_saving_per_1000(context.report)
    share = len(blank) / len(context.report.documents) if context.report.documents else 0
    context.add(
        id="ocr_blank_pages",
        title="Read the pages nothing came off",
        detail=(
            "These carry pages with no text layer and nothing recognised from them. "
            "As they stand every such page has to be sent to a model as an image, "
            "which is the expensive path. Running with --ocr, or with a second "
            "engine via --compare-ocr-engine, may get text off them."
        ),
        documents=blank,
        actor="complydoc",
        effect=f"{count(len(blank), 'document')} would move onto the text path",
        saving_usd_per_1000=round(saving * share, 4) if saving is not None else None,
    )


def _skipped_documents(context: _Context) -> None:
    """A file that could not be opened was not audited at all."""
    encrypted = [s.path.name for s in context.report.skipped if "password" in s.reason.lower()]
    context.add(
        id="supply_password",
        title="Supply a password for the encrypted files",
        detail=(
            "These were skipped and are absent from every figure in this report. "
            "Pass --password to include them."
        ),
        documents=encrypted,
        actor="you",
        effect="they would be audited",
    )

    # An unsupported type and a corrupt file are both skipped and are not the
    # same problem: one is a file of another type, the other a document that
    # cannot be opened.
    unsupported = [s.path.name for s in context.report.skipped if "unsupported" in s.reason.lower()]
    context.add(
        id="unsupported_types",
        title="Decide what to do with the files that are not documents",
        detail=(
            "These are not a format complydoc reads. Usually that is correct and "
            "they belong in the folder anyway. If they hold content a pipeline "
            "would be expected to process, converting them is the fix."
        ),
        documents=unsupported,
        actor="you",
        effect="they were not looked at, so nothing here describes them",
    )

    broken = [
        s.path.name
        for s in context.report.skipped
        if "password" not in s.reason.lower() and "unsupported" not in s.reason.lower()
    ]
    context.add(
        id="unreadable_files",
        title="Replace the files that could not be opened",
        detail=(
            "Nothing could be read from these at all. They are usually truncated "
            "or not the format their extension claims, and no setting here will "
            "recover them — the file itself has to be replaced."
        ),
        documents=broken,
        actor="you",
        effect="they are missing from every figure in this report",
    )


def _reader_disagreement(context: _Context) -> None:
    """A document read differently by two libraries needs the right one."""
    scrambled = [
        d.relative_path
        for d in context.report.documents
        if d.disagreement == "same words, different order"
    ]
    context.add(
        id="route_reader",
        title="Read these with a different library",
        detail=(
            "The readers this run compared returned the same words in a different "
            "order, which on a two-column page means one of them read straight "
            "across the columns and interleaved every sentence. Compare the "
            "readings on the Documents page and "
            + (
                "use the loader that got it right. "
                if context.report.loader_comparison
                else "set --extractor to the one that got it right. "
            )
            + "It changes nothing in the files and costs nothing."
        ),
        documents=scrambled,
        actor="you",
        effect="the text reaches a model in the order it was written",
    )

    disputed = [
        d.relative_path
        for d in context.report.documents
        if d.disagreement == "they read different words"
    ]
    context.add(
        id="reader_disputed",
        title="Check what the readers disagreed about",
        detail=(
            "Two libraries read different words off these, which usually means "
            "the page uses a font whose character map is wrong. What one of them "
            "returned is not what is on the page."
        ),
        documents=disputed,
        actor="you",
        effect="the text may not be what the page says",
    )


def _high_severity_exposure(context: _Context) -> None:
    """Identifiers you would not want leaving the building."""
    exposed = []
    for document in context.report.documents:
        scan = document.sensitive
        if scan is None:
            continue
        confirmed = [m for m in scan.matches if m.severity == "high" and m.evidence == "confirmed"]
        if confirmed:
            exposed.append(document.relative_path)

    context.add(
        id="high_severity",
        title="Deal with the confirmed high-severity identifiers",
        detail=(
            "These carry identifiers that passed a checksum. "
            "Anything sent to a hosted model takes them with it."
        ),
        documents=exposed,
        actor="you",
        effect="the strongest findings in the folder, by evidence and severity",
    )


def _poor_ocr(context: _Context) -> None:
    """Pages with low OCR confidence."""
    poor: list[str] = []
    for document in context.report.documents:
        readiness = document.readiness
        if readiness is None:
            continue
        for signal in readiness.signals:
            if signal.id == "ocr_confidence" and signal.rating == "poor":
                poor.append(document.relative_path)
                break

    context.add(
        id="rescan_pages",
        title="Rescan these at a higher resolution",
        detail=(
            "OCR read these with low confidence. What it returned will contain "
            "errors, and an error in recognised text is harder to notice than a "
            "page that was left blank. A cleaner scan is the only real fix."
        ),
        documents=poor,
        actor="you",
        effect="what a model reads would match what is on the page",
    )


def _identifying_metadata(context: _Context) -> None:
    """Metadata that carries identifiers or account names alongside every chunk."""
    exposed = [
        d.relative_path
        for d in context.report.documents
        if any(f.significant for f in d.metadata_findings) or d.path_exposures
    ]
    context.add(
        id="strip_metadata",
        title="Strip identifying metadata before indexing",
        detail=(
            "The loader returned metadata carrying identifiers or absolute file paths. "
            "Metadata is attached to every document a loader returns and is usually "
            "stored beside each chunk, so it goes wherever the text goes. Drop or "
            "rewrite those keys before the documents are embedded."
        ),
        documents=exposed,
        actor="you",
        effect="identifiers and account names are no longer stored with every chunk",
    )


def _hidden_content(context: _Context) -> None:
    """Text a reader does not see, and instructions a model would read."""
    documents = context.report.documents
    instructed = [
        d.relative_path for d in documents if any(f.severity == "high" for f in d.content_findings)
    ]
    context.add(
        id="hidden_instructions",
        title="Remove hidden instructions before these reach a model",
        detail=(
            "These contain text a reader does not see that reads as instructions to a "
            "model. Each passage is on the Security page. Remove it from the file, or drop "
            "the flagged passages from the extracted text before it is sent."
        ),
        documents=instructed,
        actor="you",
        effect="a model no longer receives instructions a reviewer cannot see",
    )
    hidden = [
        d.relative_path
        for d in documents
        if d.relative_path not in instructed
        and any(f.visibility in ("suspected", "confirmed") for f in d.content_findings)
    ]
    context.add(
        id="hidden_text",
        title="Check the hidden text in these",
        detail=(
            "These contain text a reader does not see, such as white or hidden-formatted "
            "text, that ends up in the extracted text. It may be harmless leftovers; it is "
            "still part of what a model is given."
        ),
        documents=hidden,
        actor="you",
        effect="the text a model receives matches what a reviewer sees",
    )


_BUILDERS = (
    _hidden_content,
    _no_text_layer,
    _skipped_documents,
    _reader_disagreement,
    _high_severity_exposure,
    _poor_ocr,
    _identifying_metadata,
)


def quick_wins(report: AuditReport) -> list[QuickWin]:
    """All quick wins for the report, ranked by the number of documents affected."""
    context = _Context(report=report)
    for builder in _BUILDERS:
        builder(context)
    context.wins.sort(key=lambda w: (-w.affected, w.title))
    return context.wins
