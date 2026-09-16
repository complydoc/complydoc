"""Configurable name-detection models.

Models are small spaCy pipelines built here with an entity ruler and saved to a
temporary directory, so no model download is needed.
"""

from __future__ import annotations

import pytest

import complydoc as cd
from complydoc.audit.run import ner_available
from complydoc.sensitive.detectors.ner import configured_models

spacy = pytest.importorskip("spacy")
from spacy.language import Language  # noqa: E402
from spacy.tokens import Span, SpanGroup  # noqa: E402

ENGLISH = (
    "The contract was signed by Maria Silva on behalf of the supplier, and the invoice "
    "was approved by the finance team of ACME before the end of the month."
)
PORTUGUESE = (
    "O contrato foi assinado por Maria Silva em nome do fornecedor, e a fatura foi "
    "aprovada pela equipa financeira antes do final do mês de março."
)


@Language.component("complydoc_test_scored_spans")
def _scored_spans(doc):
    """Puts every entity into a span group with a score by position: 0.9, then 0.4."""
    spans = [Span(doc, e.start, e.end, label=e.label_) for e in doc.ents]
    group = SpanGroup(doc, name="sc", spans=spans)
    group.attrs["scores"] = [0.9 if i == 0 else 0.4 for i in range(len(spans))]
    doc.spans["sc"] = group
    return doc


def pipeline(tmp_path, name, lang, label, scored=False):
    nlp = spacy.blank(lang)
    ruler = nlp.add_pipe("entity_ruler")
    ruler.add_patterns(
        [
            {"label": label, "pattern": "Maria Silva"},
            {"label": "ORG", "pattern": "ACME"},
            {"label": "ORG", "pattern": [{"LOWER": "finance"}, {"LOWER": "team"}]},
        ]
    )
    if scored:
        nlp.add_pipe("complydoc_test_scored_spans")
    path = tmp_path / name
    nlp.to_disk(path)
    return str(path)


def spacy_only(config, overrides=None):
    """The two name categories read by spaCy alone.

    The shipped configuration prefers a multilingual transformer and keeps spaCy
    as the fallback. Everything in this file is about what spaCy does, so the
    chain is collapsed to that one link rather than tested through whichever
    model happens to be installed.
    """
    settings = {}
    for category in ("person_name", "organisation_name"):
        settings[f"sensitive.categories.{category}.detector"] = "ner"
        settings[f"sensitive.categories.{category}.fallback"] = []
        settings[f"sensitive.categories.{category}.min_confidence"] = 0.0
        settings[f"sensitive.categories.{category}.model"] = {
            "name": "en_core_web_sm",
            "entity_labels": ["PERSON"] if category == "person_name" else ["ORG"],
        }
    settings.update(overrides or {})
    return config.override(settings)


def names_found(config, text):
    return [
        m.category
        for m in cd.scan_text(text, config=config).matches
        if m.category in {"person_name", "organisation_name"}
    ]


def test_a_saved_pipeline_path_is_used(config, tmp_path):
    model = pipeline(tmp_path, "english", "en", "PERSON")
    changed = spacy_only(
        config,
        {
            "sensitive.categories.person_name.model.name": model,
            "sensitive.categories.organisation_name.model.name": model,
        },
    )
    found = names_found(changed, ENGLISH)
    assert found.count("person_name") == 1
    assert found.count("organisation_name") == 1, "ACME is dropped as a short acronym"


def test_the_acronym_filter_can_be_turned_off(config, tmp_path):
    model = pipeline(tmp_path, "english", "en", "PERSON")
    changed = spacy_only(
        config,
        {
            "sensitive.categories.organisation_name.model.name": model,
            "sensitive.categories.organisation_name.model.drop_short_acronyms": False,
        },
    )
    assert names_found(changed, ENGLISH).count("organisation_name") == 2


def test_a_model_is_chosen_per_language(config, tmp_path):
    english = pipeline(tmp_path, "english", "en", "PERSON")
    portuguese = pipeline(tmp_path, "portuguese", "pt", "PER")
    changed = spacy_only(
        config,
        {
            "sensitive.categories.person_name.model": {
                "name": english,
                "entity_labels": ["PERSON"],
                "by_language": {"pt": {"name": portuguese, "entity_labels": ["PER"]}},
            }
        },
    )
    assert names_found(changed, PORTUGUESE).count("person_name") == 1
    assert names_found(changed, ENGLISH).count("person_name") == 1
    assert configured_models(changed.sensitive)[:2] == [english, portuguese]


def test_scores_from_a_span_group_are_filtered(config, tmp_path):
    model = pipeline(tmp_path, "scored", "en", "PERSON", scored=True)
    changed = spacy_only(
        config,
        {
            "sensitive.categories.organisation_name.model.name": model,
            "sensitive.categories.organisation_name.model.spans_key": "sc",
            "sensitive.categories.organisation_name.model.drop_short_acronyms": False,
            "sensitive.categories.organisation_name.min_confidence": 0.5,
        },
    )
    matches = [
        m
        for m in cd.scan_text(ENGLISH, config=changed).matches
        if m.category == "organisation_name"
    ]
    assert [m.confidence for m in matches] == []
    kept = changed.override({"sensitive.categories.organisation_name.min_confidence": 0.3})
    scores = sorted(
        m.confidence
        for m in cd.scan_text(ENGLISH, config=kept).matches
        if m.category == "organisation_name"
    )
    assert scores == [0.4, 0.4]


def test_every_configured_model_is_checked(config, tmp_path):
    model = pipeline(tmp_path, "english", "en", "PERSON")
    working = spacy_only(
        config,
        {
            "sensitive.categories.person_name.model.name": model,
            "sensitive.categories.organisation_name.model.name": model,
        },
    )
    assert ner_available(working)
    broken = working.override(
        {"sensitive.categories.organisation_name.model.name": str(tmp_path / "missing")}
    )
    assert not ner_available(broken)
    scan = cd.scan_text(ENGLISH, config=broken)
    assert "organisation_name" in scan.unscanned
    assert "person_name" not in scan.unscanned
