"""Check digits declared in `sensitive.yaml` rather than written in code."""

from __future__ import annotations

import random

import pytest
from pydantic import ValidationError

import complydoc as cd
from complydoc.config.loader import load_config
from complydoc.config.schema import CheckConfig, SensitiveConfig
from complydoc.sensitive import validators as v

NISS = load_config().sensitive.checks["pt_niss"]
UK_NHS_NUMBER = load_config().sensitive.checks["uk_nhs_number"]


def test_a_portuguese_social_security_number_passes_and_a_changed_digit_fails():
    assert v.declared(NISS, "12345678902") is True
    assert v.declared(NISS, "1234 5678 902") is True
    assert v.declared(NISS, "12345678903") is False
    # A NISS starts with 1 for a person or 2 for a company.
    assert v.declared(NISS, "32345678902") is False
    assert v.declared(NISS, "1234567890") is False


@pytest.mark.parametrize(
    "text",
    [
        "NISS: 12345678902",
        "N.º de Segurança Social 20000000001",
        "Número de beneficiário 12000000004",
    ],
)
def test_a_niss_beside_its_label_is_found_and_confirmed(text):
    found = [m for m in cd.scan_text(text).matches if m.category == "pt_niss"]
    assert len(found) == 1
    assert found[0].evidence == "confirmed"
    assert found[0].validators_passed == ["pt_niss"]


def test_a_bare_niss_shaped_number_is_not_reported():
    found = {m.category for m in cd.scan_text("Encomenda 12345678902 enviada.").matches}
    assert "pt_niss" not in found


def test_a_uk_nhs_number_passes_and_a_changed_digit_fails():
    assert v.declared(UK_NHS_NUMBER, "9434765919") is True
    assert v.declared(UK_NHS_NUMBER, "943 476 5919") is True
    assert v.declared(UK_NHS_NUMBER, "9434765918") is False
    # A check that works out to 10 is invalid.
    assert v.declared(UK_NHS_NUMBER, "0000000060") is False


def test_a_uk_nhs_number_beside_its_label_is_found_and_confirmed():
    matches = cd.scan_text("NHS number: 943 476 5919").matches
    found = [m for m in matches if m.category == "uk_nhs_number"]
    assert len(found) == 1
    assert found[0].evidence == "confirmed"
    assert found[0].validators_passed == ["uk_nhs_number"]


def test_a_bare_uk_nhs_number_is_not_reported():
    found = {m.category for m in cd.scan_text("Reference 943 476 5919 filed.").matches}
    assert "uk_nhs_number" not in found


def _check(**fields: object) -> CheckConfig:
    return CheckConfig.model_validate(fields)


# Validators written in code, declared as data: if every one agrees on thousands of values,
# the methods describe these families of check digit, not only the NISS.
AS_DATA = {
    "pl_pesel": _check(
        length=11,
        method="weighted",
        weights=[1, 3, 7, 9, 1, 3, 7, 9, 1, 3],
        modulus=10,
        subtract_from=10,
        replace={10: 0},
    ),
    "ch_ahv": _check(
        length=13,
        starts_with=["756"],
        method="weighted",
        weights=[1, 3] * 6,
        modulus=10,
        subtract_from=10,
        replace={10: 0},
    ),
    "pt_nif": _check(
        length=9,
        starts_with=[*"1235689", "45", "70", "71", "72", "74", "75", "77", "78", "79"],
        method="weighted",
        weights=[9, 8, 7, 6, 5, 4, 3, 2],
        modulus=11,
        subtract_from=11,
        replace={10: 0, 11: 0},
    ),
    "aba_routing": _check(length=9, method="weighted", weights=[3, 7, 1] * 3, zero=True),
    "au_tfn": _check(
        length=9, method="weighted", weights=[1, 4, 3, 7, 5, 8, 6, 9, 10], modulus=11, zero=True
    ),
    "ca_sin": _check(length=9, starts_with=list("12345679"), method="luhn"),
}


def _values() -> list[str]:
    rng = random.Random(11)
    values = []
    for _ in range(20000):
        digits = "".join(rng.choice("0123456789") for _ in range(rng.choice([9, 11, 13])))
        if rng.random() < 0.3:
            digits = "756" + digits[3:]
        values.append(digits)
    return values


@pytest.mark.parametrize("name", sorted(AS_DATA))
def test_validators_in_code_can_be_declared_as_data(name):
    code = v.VALIDATORS[name]
    values = _values()
    differ = [value for value in values if code(value) != v.declared(AS_DATA[name], value)]
    assert differ == []
    assert any(code(value) for value in values)


def test_the_weights_must_fit_the_length():
    with pytest.raises(ValidationError, match="numbers 10 digits long"):
        _check(length=11, method="weighted", weights=[1] * 9)


def test_a_declared_check_cannot_take_a_built_in_validators_name():
    raw = load_config().sensitive.model_dump()
    raw["checks"]["luhn"] = {"length": 16, "method": "luhn"}
    with pytest.raises(ValidationError, match="luhn"):
        SensitiveConfig.model_validate(raw)
