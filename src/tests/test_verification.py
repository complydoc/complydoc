"""`--verify`: a second, independent read of the pages by a vision model the caller brings.

Nothing here reaches the network. The models are functions in this file, which
is what a caller's own model is to complydoc: code it is handed, calls with a
page image, and compares the answer of.
"""

from __future__ import annotations

import shutil

import pytest
from typer.testing import CliRunner

import complydoc as cd
from complydoc import offline
from complydoc.cli import app
from complydoc.config.loader import load_config
from complydoc.loaders import parsers
from complydoc.report.models import ReadingCost
from complydoc.verification import (
    VisionError,
    VisionPage,
    VisionReading,
    reading_cost,
    registered_vision_model,
    resolve_vision,
)
from complydoc.verification.check import compare
from tests.helpers import FIXTURES

runner = CliRunner()

EXTRA = "A clause only the picture had."


def _text_layer(page: VisionPage) -> str:
    import pypdf

    path = FIXTURES / page.document
    if path.suffix.lower() != ".pdf":
        return ""
    return pypdf.PdfReader(path).pages[page.number - 1].extract_text() or ""


def faithful(page: VisionPage) -> VisionReading:
    """Reads what the text layer holds, and says what the call used."""
    assert page.image.startswith(b"\x89PNG"), "the model is given a PNG"
    return VisionReading(text=_text_layer(page), input_tokens=1500, output_tokens=400)


faithful.model = "claude-opus-5"  # type: ignore[attr-defined]


def sharper(page: VisionPage) -> VisionReading:
    """Reads a line on every page that no text layer carries."""
    return VisionReading(text=f"{_text_layer(page)}\n{EXTRA}", input_tokens=1500, output_tokens=400)


sharper.model = "claude-opus-5"  # type: ignore[attr-defined]


def broken(page: VisionPage) -> str:
    raise RuntimeError("rate limited")


def make_sharper() -> object:
    """A factory `vision:module:function` can find."""
    return sharper


def not_a_factory() -> str:
    return "not callable"


@pytest.fixture
def one_pdf(tmp_path):
    shutil.copy(FIXTURES / "native_text.pdf", tmp_path / "native_text.pdf")
    return tmp_path / "native_text.pdf"


# --- Naming a model ----------------------------------------------------------


def test_a_spec_names_your_own_function():
    assert resolve_vision("vision:tests.test_verification:make_sharper") is sharper


@pytest.mark.parametrize(
    ("spec", "message"),
    [
        ("vision", "use 'vision:module:function'"),
        ("claude:tests.test_verification:make_sharper", "unknown verifier"),
        ("vision:claude-opus-5", "complydoc runs no vision model of its own"),
        ("vision:no.such.module:read", "cannot import 'no.such.module'"),
        ("vision:tests.test_verification:missing", "has no 'missing'"),
        ("vision:tests.test_verification:not_a_factory", "not a callable"),
    ],
)
def test_a_spec_that_names_no_model_says_why(spec, message):
    with pytest.raises(VisionError, match=message):
        resolve_vision(spec)


# --- Comparing two readings --------------------------------------------------


def test_coverage_ignores_layout_and_order():
    found = compare(
        "Total due 100 EUR. Payment terms apply.", "| Payment terms apply |\n# Total due: 100 EUR"
    )
    assert found.coverage == 1.0
    assert found.missing == ""
    assert found.similarity < 1.0


def test_what_the_kept_reading_lacks_is_quoted():
    found = compare("Payment is due.", "Payment is due. Late fees are 5% a month.")
    assert found.coverage is not None and found.coverage < 0.5
    assert found.missing == "Late fees are 5 a month"
    assert found.longest_missing == 6


def test_a_vision_reading_of_nothing_is_not_coverage():
    assert compare("Payment is due.", "").coverage is None


# --- Pricing a reading -------------------------------------------------------


def test_a_reading_with_token_counts_is_priced_as_actual():
    pricing = load_config().pricing
    model = next(m for m in pricing.models if m.id == "claude-opus-5")
    cost = reading_cost(
        VisionReading(text="x", input_tokens=1_000_000, output_tokens=0),
        "claude-opus-5",
        pricing,
        None,
    )
    assert cost.basis == "actual"
    assert cost.usd == pytest.approx(model.input_per_mtok_usd)


def test_a_reading_without_counts_is_estimated_from_the_page_size():
    from complydoc.cost.vision import RenderedSize

    pricing = load_config().pricing
    cost = reading_cost(VisionReading(text="x"), "claude-opus-5", pricing, RenderedSize(1000, 1400))
    assert cost.basis == "estimated"
    assert cost.usd is not None and cost.usd > 0
    assert cost.input_tokens


def test_a_price_the_model_returns_is_taken_as_given():
    cost = reading_cost(VisionReading(text="x", usd=0.5), "anything", load_config().pricing, None)
    assert cost == ReadingCost(0.5, "actual", "anything")


def test_a_model_nobody_priced_says_so_rather_than_zero():
    cost = reading_cost(VisionReading(text="x"), "my-own-model", load_config().pricing, None)
    assert cost.basis == "unpriced"
    assert cost.usd is None


# --- An audit that verifies --------------------------------------------------


def test_every_page_is_read_again_and_a_missing_line_is_found(one_pdf):
    report = cd.full_audit(one_pdf, verify_with=sharper, verify_scope="all", extracted_text=True)

    summary = report.verification
    assert summary is not None
    assert summary.pages_checked == summary.pages_total == report.documents[0].page_count
    assert summary.pages_disagree == summary.pages_checked
    assert summary.usd_basis == "actual"
    assert "disagree" in summary.headline

    page = report.documents[0].verification.pages[0]
    assert page.status == "disagrees"
    assert EXTRA.rstrip(".") in page.missing
    assert report.run.verify_model == "vision:claude-opus-5"
    assert any(w.id == "vision_disagrees" for w in report.quick_wins)
    assert any(item.area == "Pages a vision model read differently" for item in report.limitations)


def test_one_missing_sentence_on_a_long_page_still_disagrees():
    long_page = " ".join(f"word{n}" for n in range(400))
    found = compare(long_page, f"{long_page} {EXTRA}")
    assert found.coverage is not None and found.coverage > 0.9
    assert found.longest_missing >= 4


def test_a_faithful_read_agrees(one_pdf):
    report = cd.full_audit(one_pdf, verify_with=faithful, verify_scope="all")
    assert report.verification.pages_disagree == 0
    assert report.verification.pages_agree == report.verification.pages_checked


def test_by_default_only_flagged_pages_are_read_again(one_pdf):
    report = cd.full_audit(one_pdf, verify_with=sharper)
    assert report.run.verify_scope == "flagged"
    # A clean text layer: nothing flagged it, so nothing was sent, and the report
    # says every page went unread rather than that every page agreed.
    assert report.verification.pages_checked == 0
    assert any(item.area == "Pages not read again" for item in report.limitations)


def test_a_page_with_no_reading_takes_the_vision_one_and_is_scanned(tmp_path):
    shutil.copy(FIXTURES / "scanned_page.pdf", tmp_path / "scanned_page.pdf")

    def reads_a_scan(page: VisionPage) -> str:
        return "Card 4111 1111 1111 1111 expires 12/29."

    reads_a_scan.model = "claude-opus-5"  # type: ignore[attr-defined]
    report = cd.full_audit(tmp_path, verify_with=reads_a_scan, extracted_text=True)

    document = report.documents[0]
    assert document.verification.pages[0].status == "filled"
    assert document.extracted_text[0].source == "vision"
    assert document.extracted_text[0].kept == "vision:claude-opus-5"
    assert document.verification.pages[0].cost.basis == "estimated"
    # Scanned after the vision reading filled the page, so what it read was searched.
    assert any(m.category == "card_number" for m in document.sensitive.matches)
    assert any(item.area == "Pages read only by a vision model" for item in report.limitations)


def test_a_model_that_raises_fails_its_pages_and_not_the_run(one_pdf):
    report = cd.full_audit(one_pdf, verify_with=broken, verify_scope="all")
    assert report.verification.pages_failed == report.verification.pages_checked
    assert "rate limited" in report.documents[0].verification.pages[0].error
    assert any(item.area == "Vision calls that failed" for item in report.limitations)


def test_a_page_that_cannot_be_drawn_is_not_sent():
    report = cd.full_audit(FIXTURES / "sample.docx", verify_with=sharper, verify_scope="all")
    pages = report.documents[0].verification.pages
    assert pages and all(page.status == "not_rendered" for page in pages)
    assert report.verification.pages_checked == 0


def test_the_guard_is_back_and_the_model_gone_after_the_run(one_pdf):
    before = offline.is_armed()
    cd.full_audit(one_pdf, verify_with=sharper, verify_scope="all")
    assert registered_vision_model() is None
    assert offline.is_armed() == before


def test_a_scope_that_does_not_exist_is_refused(one_pdf):
    with pytest.raises(ValueError, match="verify_scope"):
        cd.full_audit(one_pdf, verify_with=sharper, verify_scope="some")  # type: ignore[typeddict-item]


def test_a_run_without_verify_says_nothing_about_it(one_pdf):
    report = cd.full_audit(one_pdf)
    assert report.verification is None
    assert report.run.verify_model is None
    assert all(d.verification is None for d in report.documents)


# --- What each reading cost --------------------------------------------------


def test_each_reading_carries_its_cost_and_local_readers_are_free(one_pdf):
    report = cd.full_audit(
        one_pdf,
        verify_with=sharper,
        verify_scope="all",
        extracted_text=True,
        compare_extractors=["pypdf"],
    )
    page = report.documents[0].extracted_text[0]
    assert page.kept == "pdfplumber"
    assert page.costs["pdfplumber"] == ReadingCost(0.0, "local")
    assert page.costs["pypdf"] == ReadingCost(0.0, "local")
    assert page.costs["vision:claude-opus-5"].basis == "actual"
    assert "vision:claude-opus-5" in page.readings


def test_a_page_says_what_a_vision_read_of_it_would_cost(one_pdf):
    report = cd.full_audit(one_pdf, extracted_text=True)
    estimate = report.documents[0].extracted_text[0].vision_estimate
    assert estimate is not None
    assert estimate.basis == "estimated"
    assert estimate.usd is not None and estimate.usd > 0
    model = report.documents[0].cost.models[0]
    assert len(model.vision_tokens_by_page["medium"]) == report.documents[0].page_count


def test_verification_survives_the_json(one_pdf, tmp_path):
    report = cd.full_audit(one_pdf, verify_with=sharper, verify_scope="all", extracted_text=True)
    path = cd.write_json(report, tmp_path / "report.json", detail="full")
    back = cd.load_report(path)
    assert back.verification == report.verification
    assert back.documents[0].verification == report.documents[0].verification
    assert back.documents[0].extracted_text[0].costs == report.documents[0].extracted_text[0].costs


def test_the_html_report_shows_the_check(one_pdf, tmp_path):
    report = cd.full_audit(one_pdf, verify_with=sharper, verify_scope="all", extracted_text=True)
    html = cd.write_html(report, tmp_path / "report.html").read_text()
    assert "Vision verification" in html
    assert "from the provider's token counts" in html
    assert "free, ran on this machine" in html


# --- Loaders -----------------------------------------------------------------


class _Doc:
    def __init__(self, page_content: str, metadata: dict) -> None:
        self.page_content = page_content
        self.metadata = metadata


def _loader(path: str) -> list[_Doc]:
    import pypdf

    pages = pypdf.PdfReader(path).pages
    return [
        _Doc(page.extract_text() or "", {"source": path, "page": index})
        for index, page in enumerate(pages)
    ]


def test_compare_loaders_verifies_the_baseline_and_prices_each_loader(one_pdf):
    priced = parsers.LoaderSpec(name="priced", factory=_loader, price_key="azure_layout")
    report = cd.compare_loaders(
        {"local": _loader, "priced": priced},
        paths=one_pdf,
        verify_with=sharper,
        verify_scope="all",
    )
    assert report.verification is not None
    assert report.verification.pages_disagree >= 1
    page = report.documents[0].extracted_text[0]
    assert page.kept == "local"
    assert page.costs["local"] == ReadingCost(0.0, "local")
    assert page.costs["priced"].usd == pytest.approx(10.0 / 1000)
    assert page.costs["vision:claude-opus-5"].basis == "actual"
    assert registered_vision_model() is None


# --- The command line --------------------------------------------------------


def test_the_command_verifies_and_says_the_pages_leave(one_pdf, tmp_path):
    result = runner.invoke(
        app,
        [
            "audit",
            str(one_pdf),
            "--verify",
            "vision:tests.test_verification:make_sharper",
            "--verify-scope",
            "all",
            "--out",
            str(tmp_path / "out"),
        ],
    )
    assert result.exit_code == 0, result.output
    assert "is your own code" in result.output
    assert "checked against an independent vision read" in result.output


def test_the_command_refuses_a_model_it_cannot_find(one_pdf, tmp_path):
    result = runner.invoke(
        app, ["audit", str(one_pdf), "--verify", "vision:gpt", "--out", str(tmp_path), "--quiet"]
    )
    assert result.exit_code == 2
    assert "Cannot use that vision model" in result.output


def test_the_command_refuses_an_unknown_scope(one_pdf, tmp_path):
    result = runner.invoke(
        app,
        [
            "audit",
            str(one_pdf),
            "--verify",
            "vision:tests.test_verification:make_sharper",
            "--verify-scope",
            "some",
            "--out",
            str(tmp_path),
        ],
    )
    assert result.exit_code == 2
    assert "--verify-scope must be" in result.output


def test_every_reading_is_counted_so_a_page_can_be_priced_on_any_model(one_pdf):
    from complydoc.report.json_writer import to_dict

    report = cd.full_audit(one_pdf, extracted_text=True, compare_extractors=["pypdf"])
    page = report.documents[0].extracted_text[0]
    models = to_dict(report)["cost"]["models"]
    tokenizers = {m["tokenizer"] for m in models}
    formulas = {m["vision_formula"] for m in models if m["supports_vision"]}

    # Every reader, once per way of counting the models compared use.
    assert set(page.tokens) >= {"pdfplumber", "pypdf"}
    assert set(page.tokens["pdfplumber"]) == tokenizers
    # And the page as an image, once per formula a vision model uses.
    assert set(page.image_tokens) == formulas
    # What pricing one page takes, kept in the summary JSON too.
    assert all(m["input_per_mtok_usd"] is not None for m in models)
    assert any(not m["supports_vision"] for m in models)
