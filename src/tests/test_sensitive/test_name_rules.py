"""Names a rule finds beside the model: after a label, or by a company form."""

from __future__ import annotations

import pytest

from complydoc.config.schema import NerModelSpec
from complydoc.extraction.extract import mask_matches
from complydoc.sensitive.base import DetectorContext, Finding
from complydoc.sensitive.registry import register
from complydoc.sensitive.scanner import scan_text
from tests.helpers import requires_ner

RECORD = (
    "EMPLOYEE RECORD\n"
    "Name: Jane Doe\n"
    "Employer: Acme Holdings Ltd\n"
    "National Insurance number: AB123456C\n"
    "Approved by John Smith, Finance Director.\n"
)


class _SmallModel:
    """Stands in for a name model that reads only what a small one does."""

    id = "test_small_name_model"

    def find(self, text: str, context: DetectorContext) -> list[Finding]:
        wanted = "John Smith" if context.category_id == "person_name" else None
        at = text.find(wanted) if wanted else -1
        return (
            [Finding(start=at, end=at + len(wanted), confidence=None)] if wanted and at >= 0 else []
        )


register(_SmallModel())


def _with(config, detector: str):
    """The shipped settings with the name categories read by `detector` alone."""
    names = ("person_name", "organisation_name")
    return config.override(
        {f"sensitive.categories.{c}.fallback": [] for c in names}
        | {f"sensitive.categories.{c}.detector": detector for c in names}
    ).sensitive


def _names(matches) -> list[tuple[str, str | None, str]]:
    return [
        (m.category, m.revealed, m.evidence)
        for m in matches
        if m.category in ("person_name", "organisation_name")
    ]


def test_a_rule_adds_the_names_the_model_missed(config):
    matches, unscanned = scan_text(RECORD, _with(config, _SmallModel.id), reveal=True)
    assert _names(matches) == [
        # After its label: corroborated by it, whatever the model made of it.
        ("person_name", "Jane Doe", "corroborated"),
        # By its company form.
        ("organisation_name", "Acme Holdings Ltd", "pattern"),
        # The model's own, once: the rule that also finds it is not counted again.
        ("person_name", "John Smith", "model"),
    ]
    assert unscanned == {}


def test_without_a_model_the_rules_cover_the_text_and_report_nothing(config):
    settings = _with(config, "a_detector_nobody_registered")
    matches, unscanned = scan_text(RECORD, settings, reveal=True)
    # A count from the rules alone would read as the category's count, on a run that
    # could not scan it.
    assert _names(matches) == []
    assert {"person_name", "organisation_name"} <= set(unscanned)
    covering, _ = scan_text(RECORD, settings, masking=True)
    masked = mask_matches(RECORD, covering)[0]
    assert "Jane Doe" not in masked and "Acme Holdings" not in masked and "John Smith" not in masked
    assert "EMPLOYEE RECORD" in masked


@pytest.mark.parametrize(
    ("text", "found"),
    [
        ("Employer: Acme Holdings Ltd", ["Acme Holdings Ltd"]),
        ("HARBOUR LOGISTICS LTD\nVendor assessment", ["HARBOUR LOGISTICS LTD"]),
        ("Supplier: Müller & Söhne GmbH, Berlin", ["Müller & Söhne GmbH"]),
        (
            "Banco Exemplo S.A. e Transportes Lusos Lda",
            ["Banco Exemplo S.A.", "Transportes Lusos Lda"],
        ),
        ("Morgan Ltd and A&B Foods Limited.", ["Morgan Ltd", "A&B Foods Limited"]),
        ("Marks and Spencer plc reported.", ["Marks and Spencer plc"]),
        # Not companies: a lower-case form, a sentence's first word, a bare abbreviation.
        ("The limited edition was signed by hand.", []),
        ("See SL 4. The Acme Trading Ltd case.", ["Acme Trading Ltd"]),
        ("We are an AG member.", []),
    ],
)
def test_a_company_is_found_by_its_form(config, text, found):
    matches, _ = scan_text(text, _with(config, _SmallModel.id), reveal=True)
    assert [m.revealed for m in matches if m.category == "organisation_name"] == found


@pytest.mark.parametrize(
    ("text", "found"),
    [
        ("Name: Jane Doe", ["Jane Doe"]),
        ("  Full name:  Maria da Silva Santos", ["Maria da Silva Santos"]),
        ("Nome: João Pereira", ["João Pereira"]),
        ("Customer name: Ana P. Costa", ["Ana P. Costa"]),
        ("signed by Maria Santos on Monday", ["Maria Santos"]),
        # A name's label starts its line, and a name is more than one capitalised word.
        ("File name: report.pdf", []),
        ("Product name: Super Widget Pro", []),
        ("Name: Widget", []),
        ("the form was signed by hand", []),
    ],
)
def test_a_person_is_found_by_the_label_before_the_name(config, text, found):
    matches, _ = scan_text(text, _with(config, _SmallModel.id), reveal=True)
    assert [m.revealed for m in matches if m.category == "person_name"] == found


def test_mask_text_covers_what_the_rules_find_where_no_model_ran(config):
    import complydoc as cd

    settings = config.override(
        {f"sensitive.categories.{c}.fallback": [] for c in ("person_name", "organisation_name")}
        | {
            f"sensitive.categories.{c}.detector": "a_detector_nobody_registered"
            for c in ("person_name", "organisation_name")
        }
    )
    masked = cd.mask_text("HARBOUR LOGISTICS LTD\nName: Jane Doe", config=settings)
    assert "HARBOUR" not in masked.text and "Jane" not in masked.text
    # Still said: the names a model would have found are not covered.
    assert {"person_name", "organisation_name"} <= set(masked.unscanned)


@pytest.mark.parametrize(
    ("span", "heading"),
    [
        ("CONDITIONS 4", True),
        ("SCHEDULE 2.", True),
        ("TERMS AND CONDITIONS 12", True),
        # A name in mixed case, one with no number, a number alone, and a short code.
        ("Channel 4", False),
        ("HARBOUR LOGISTICS LTD", False),
        ("4", False),
        ("3M", False),
    ],
)
def test_capitals_ending_in_a_bare_number_are_a_heading_not_a_name(span, heading):
    from complydoc.sensitive.base import numbered_heading

    assert numbered_heading(span) is heading


@requires_ner
def test_the_small_model_no_longer_takes_a_heading_for_an_organisation(config):
    """`TERMS AND CONDITIONS 4. Neither party…` is how a two-column page reads as flat
    text, and the small English model called `CONDITIONS 4` an organisation."""
    text = "TERMS AND CONDITIONS 4. Neither party is liable for\nindirect or consequential loss\n"
    settings = _with(config, "ner")
    for name, label in (("person_name", "PERSON"), ("organisation_name", "ORG")):
        settings = settings.model_copy(
            update={
                "categories": {
                    **settings.categories,
                    name: settings.categories[name].model_copy(
                        update={
                            "min_confidence": 0.0,
                            "model": NerModelSpec(name="en_core_web_sm", entity_labels=[label]),
                        }
                    ),
                }
            }
        )
    matches, unscanned = scan_text(text, settings, reveal=True)
    assert unscanned == {}
    assert [m.revealed for m in matches if m.category == "organisation_name"] == []
    # With the filter off, the model's answer is what it was.
    unfiltered = settings.model_copy(
        update={
            "categories": {
                **settings.categories,
                "organisation_name": settings.categories["organisation_name"].model_copy(
                    update={
                        "model": NerModelSpec(
                            name="en_core_web_sm",
                            entity_labels=["ORG"],
                            drop_numbered_headings=False,
                        )
                    }
                ),
            }
        }
    )
    found, _ = scan_text(text, unfiltered, reveal=True)
    assert "CONDITIONS 4" in [m.revealed for m in found if m.category == "organisation_name"]
