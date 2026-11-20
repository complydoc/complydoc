"""The decision model's hook: off by default, and never a way for something to leak."""

from __future__ import annotations

import json
import logging

import pytest

from complydoc.config.schema import JudgeConfig
from complydoc.sensitive.judge import JudgeModel, features
from complydoc.sensitive.scanner import scan_text

# A phone number rests on its shape and its label; an IBAN is confirmed by its check
# digits; an AWS key is a credential.
TEXT = "Phone: 07700 900123\nIBAN: PT50 0002 0123 1234 5678 9015 4\nAWS key: AKIA2E0A8F3B244C9986"
_MODELS = {"person_name", "organisation_name"}


def _model(path, *, none=0.0, person=0.0, business=0.0, weights=None):
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "classes": ["none", "person", "business"],
                "bias": [none, person, business],
                "weights": weights or {},
            }
        )
    )
    return str(path)


def _with_judge(config, **judge):
    sensitive = config.sensitive.model_copy(update={"judge": JudgeConfig(enabled=True, **judge)})
    return sensitive


def _categories(text, sensitive):
    matches, _ = scan_text(text, sensitive)
    return sorted(m.category for m in matches if m.category not in _MODELS)


def test_the_judge_is_off_by_default(config):
    assert config.sensitive.judge.enabled is False


def test_a_judge_that_reads_everything_as_noise_takes_only_shape_finds(config, tmp_path):
    before = _categories(TEXT, config.sensitive)
    assert {"phone_number", "iban", "api_key"} <= set(before)
    judged = _categories(TEXT, _with_judge(config, model=_model(tmp_path / "j.json", none=9.0)))
    # The IBAN's check digits and the credential are beyond a judge's reach.
    assert "iban" in judged
    assert "api_key" in judged
    assert not set(judged) & {"phone_number", "international_phone"}


def test_a_business_identifier_stays_unless_the_policy_lets_it_pass(config, tmp_path):
    model = _model(tmp_path / "j.json", business=9.0)
    masked = _categories(TEXT, _with_judge(config, model=model))
    passed = _categories(TEXT, _with_judge(config, model=model, business="pass"))
    assert masked == _categories(TEXT, config.sensitive)
    assert not set(passed) & {"phone_number", "international_phone"}
    assert "iban" in passed


def test_a_judge_that_cannot_be_read_keeps_every_finding(config, tmp_path, caplog):
    with caplog.at_level(logging.WARNING):
        judged = _categories(TEXT, _with_judge(config, model=str(tmp_path / "missing.json")))
    assert judged == _categories(TEXT, config.sensitive)
    assert "every finding is kept" in caplog.text


def test_features_read_the_words_before_the_value():
    text = "Encomenda n.º 0209396017"
    found = features(text, "phone_number", 14, 24, "pattern")
    assert found["pre=encomenda"] == 1.0
    assert found["cat=phone_number"] == 1.0


def test_a_model_with_other_classes_is_refused():
    with pytest.raises(ValueError):
        JudgeModel.from_json(
            {"version": 1, "classes": ["a", "b", "c"], "bias": [0, 0, 0], "weights": {}}
        )
