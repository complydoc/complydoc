"""Configuration overrides in code, and registering signals and detectors."""

from __future__ import annotations

import re

import pytest

import complydoc as cd
from complydoc.readiness import registry as signal_registry
from complydoc.sensitive import registry as detector_registry
from tests.helpers import FIXTURES


class UppercaseSignal:
    id = "uppercase_share"
    name = "Uppercase words"
    unit = "% of words"
    why = "Text in capitals is often a heading or a label."
    applies_to = frozenset(cd.DocumentFormat)

    def measure(self, document: cd.Document) -> cd.Measurement:
        words = document.full_text.split()
        if not words:
            return cd.Measurement.na("no words")
        share = sum(1 for w in words if w.isupper() and len(w) > 1) / len(words) * 100
        return cd.Measurement(value=round(share, 2), display=f"{share:.1f}%")


class EmployeeIdDetector:
    id = "employee_id"

    def find(self, text: str, context: cd.DetectorContext) -> list[cd.Finding]:
        return [cd.Finding(m.start(), m.end()) for m in re.finditer(r"\bEMP-\d{6}\b", text)]


@pytest.fixture
def uppercase_signal():
    cd.register_signal(UppercaseSignal())
    yield
    signal_registry._SIGNALS.pop("uppercase_share", None)


@pytest.fixture
def employee_detector():
    cd.register_detector(EmployeeIdDetector())
    yield
    detector_registry._DETECTORS.pop("employee_id", None)


def test_an_override_returns_a_new_config(config):
    changed = config.override({"hidden.instructions.classifier_threshold": 0.5})
    assert changed.hidden.instructions.classifier_threshold == 0.5
    assert config.hidden.instructions.classifier_threshold == 0.8
    assert changed.digest != config.digest


def test_an_override_can_use_a_tuple_path_and_list_ids(config):
    model = config.pricing.models[0].id
    changed = config.override({("pricing", "models", model, "enabled"): False})
    assert not changed.pricing.model_by_id(model).enabled


def test_an_unknown_setting_is_rejected(config):
    with pytest.raises(cd.ConfigError, match="no setting"):
        config.override({"readiness.nothing.weight": 1})


def test_an_invalid_value_is_rejected(config):
    with pytest.raises(cd.ConfigError, match="invalid"):
        config.override({"hidden.visibility.render_dpi": 5})


def test_a_disabled_signal_is_not_measured(config):
    changed = config.override({"readiness.signals.garbled_char_rate.enabled": False})
    report = cd.readiness_audit(FIXTURES / "native_text.pdf", config=changed)
    assert "garbled_char_rate" not in {s.id for s in report.documents[0].readiness.signals}


def test_a_registered_signal_is_measured_and_rated_once_configured(config, uppercase_signal):
    unrated = cd.readiness_audit(FIXTURES / "native_text.pdf", config=config)
    signal = next(s for s in unrated.documents[0].readiness.signals if s.id == "uppercase_share")
    assert signal.value is not None and signal.rating is None

    rated_config = config.override(
        {
            "readiness.signals.uppercase_share": {
                "weight": 0.01,
                "direction": "lower_is_better",
                "thresholds": {"good": {"lt": 20}, "fair": {"lt": 50}, "poor": {"gte": 50}},
            }
        }
    )
    rated = cd.readiness_audit(FIXTURES / "native_text.pdf", config=rated_config)
    signal = next(s for s in rated.documents[0].readiness.signals if s.id == "uppercase_share")
    assert signal.rating in {"good", "fair", "poor"}


def test_a_registered_detector_serves_a_configured_category(config, employee_detector):
    changed = config.override(
        {
            "sensitive.categories.employee_id": {
                "label": "Employee ID",
                "detector": "employee_id",
                "severity": "medium",
            }
        }
    )
    scan = cd.scan_text("Badge EMP-004211 issued.", config=changed)
    assert [m.category for m in scan.matches if m.category == "employee_id"] == ["employee_id"]


def test_a_duplicate_registration_is_rejected(uppercase_signal):
    with pytest.raises(ValueError, match="duplicate"):
        cd.register_signal(UppercaseSignal())


def test_an_object_that_is_not_a_signal_is_rejected():
    with pytest.raises(TypeError, match="Signal protocol"):
        cd.register_signal(object())  # type: ignore[arg-type]
