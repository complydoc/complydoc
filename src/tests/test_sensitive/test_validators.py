"""Checksums. These are what stop the scan drowning in false positives."""

from __future__ import annotations

import pytest

from complydoc.sensitive.validators import (
    iban_mod97,
    luhn,
    ni_prefix,
    plausible_dob,
    sort_code,
    uk_phone,
    uk_postcode,
    validate,
    vat_mod97,
)


@pytest.mark.parametrize("value", ["4111 1111 1111 1111", "4111111111111111", "5500005555555559"])
def test_luhn_accepts_valid_test_pans(value):
    assert luhn(value) is True


@pytest.mark.parametrize("value", ["4111111111111112", "1234567812345678", "123"])
def test_luhn_rejects_invalid(value):
    assert luhn(value) is False


def test_iban_accepts_the_specification_example():
    assert iban_mod97("GB82 WEST 1234 5698 7654 32") is True


@pytest.mark.parametrize("value", ["GB83 WEST 1234 5698 7654 32", "GB82WEST", "not an iban"])
def test_iban_rejects_invalid(value):
    assert iban_mod97(value) is False


@pytest.mark.parametrize("value", ["AB123456C", "JK 12 34 56 A"])
def test_ni_prefix_accepts_valid(value):
    assert ni_prefix(value) is True


@pytest.mark.parametrize(
    ("value", "why"),
    [
        ("QQ123456C", "Q is not allowed"),
        ("DA123456C", "D is not allowed first"),
        ("BG123456C", "administratively reserved pair"),
    ],
)
def test_ni_prefix_rejects_invalid(value, why):
    assert ni_prefix(value) is False, why


def test_vat_accepts_a_checksum_valid_number():
    assert vat_mod97("GB123456782") is True


def test_vat_rejects_a_checksum_invalid_number():
    assert vat_mod97("GB123456789") is False


@pytest.mark.parametrize(("value", "expected"), [("12-34-56", True), ("000000", False)])
def test_sort_code(value, expected):
    assert sort_code(value) is expected


@pytest.mark.parametrize(
    ("value", "expected"), [("EC1A 1BB", True), ("SW1A2AA", True), ("ZZ9 9ZZ", False)]
)
def test_uk_postcode(value, expected):
    assert uk_postcode(value) is expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [("020 7946 0958", True), ("+44 20 7946 0958", True), ("123", False), ("99999999999", False)],
)
def test_uk_phone(value, expected):
    assert uk_phone(value) is expected


def test_dob_rejects_an_implausible_year():
    assert plausible_dob("14/03/1985") is True
    assert plausible_dob("14/03/1785") is False


def test_validate_stops_at_the_first_failure():
    ok, passed = validate("not a card", ["luhn", "iban_mod97"])
    assert ok is False
    assert passed == []


def test_validate_reports_which_checks_passed():
    ok, passed = validate("GB82 WEST 1234 5698 7654 32", ["iban_mod97"])
    assert ok is True
    assert passed == ["iban_mod97"]


def test_unknown_validator_name_is_ignored_not_fatal():
    ok, passed = validate("anything", ["no_such_validator"])
    assert ok is True
    assert passed == []


# --- other jurisdictions ---------------------------------------------------


@pytest.mark.parametrize(
    ("checker", "good", "bad"),
    [
        ("us_ssn", "219-09-9999", "666-12-3456"),
        ("us_ssn", "219-09-9999", "000-12-3456"),
        ("aba_routing", "111000025", "111000026"),
        ("nl_bsn", "111222333", "111222334"),
        ("pt_nif", "501442600", "501442601"),
        ("es_dni", "12345678Z", "12345678A"),
        ("es_dni", "X1234567L", "X1234567A"),
        ("ie_pps", "1234567FA", "1234567XX"),
        ("de_steuer_id", "02476291358", "02476291359"),
    ],
)
def test_national_identifier_checksums(checker, good, bad):
    """Each of these carries a checksum, which is what keeps the scan usable."""
    from complydoc.sensitive.validators import VALIDATORS

    assert VALIDATORS[checker](good) is True, f"{checker} rejected a valid value"
    assert VALIDATORS[checker](bad) is False, f"{checker} accepted an invalid value"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("DE123456789", True),
        ("GB123456782", True),
        ("GB123456789", False),
        ("NL123456789B01", True),
        ("XX123", False),
        ("FR1234567890", False),
        ("FRXX123456789", True),
        ("ATU12345678", True),
        ("AT123456789", False),
        ("ESX1234567X", True),
        ("IE1234567WA", True),
        ("BE0123456789", True),
        # A word that happens to start with a country code, as research papers are full of.
        ("benchmark163", False),
        ("BENCHMARK163", False),
        ("detection2024", False),
        ("de123456789", False),
    ],
)
def test_eu_vat_country_rules(value, expected):
    from complydoc.sensitive.validators import eu_vat

    assert eu_vat(value) is expected


def test_every_configured_validator_exists(config):
    """Every validator named in the config exists."""
    from complydoc.sensitive.validators import VALIDATORS

    for name, category in config.sensitive.categories.items():
        for validator in category.validators:
            assert validator in VALIDATORS, f"{name} names unknown validator {validator!r}"


def test_categories_cover_more_than_one_jurisdiction(config):
    regions = {c.region for c in config.sensitive.enabled_categories.values()}
    assert {"UK", "US", "international"} <= regions
    assert len(regions) >= 6


@pytest.mark.parametrize(
    "value",
    [
        "4111 1111 1111 1111",  # Visa
        "4222222222222",  # Visa, 13 digits
        "5555 5555 5555 4444",  # Mastercard
        "2223003122003222",  # Mastercard 2-series
        "378282246310005",  # American Express
        "6011111111111117",  # Discover
        "3530111333300000",  # JCB
        "30569309025904",  # Diners Club, 14 digits
    ],
)
def test_card_issuer_accepts_numbers_from_card_networks(value):
    from complydoc.sensitive.validators import card_issuer

    assert card_issuer(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "20260909103836",  # a PDF creation date, which passes Luhn
        "12345678903",  # too short for any network
        "9111111111111111",  # no network starts with 9
    ],
)
def test_card_issuer_rejects_numbers_no_network_issues(value):
    from complydoc.sensitive.validators import card_issuer

    assert card_issuer(value) is False


def test_a_pdf_timestamp_is_not_reported_as_a_card_number(config):
    """PDFPlumberLoader puts `CreationDate` in raw PDF date syntax into metadata.

    The fourteen digits in it satisfy Luhn, and before the issuer check they
    were reported as a high-severity card number confirmed by a checksum.
    """
    from complydoc.sensitive.scanner import scan_text

    matches, _ = scan_text("D:20260909103836+01'00'", config.sensitive)
    assert not [m for m in matches if m.category == "card_number"]


def _by_pattern(matches) -> list[str]:
    """Labels found by a rule, in order. Names come from a model where one is installed, and
    what it makes of `Curran Associates` is not what these tests are about."""
    return sorted(match.label for match in matches if match.evidence != "model")


@pytest.mark.parametrize(
    "text",
    [
        # From a reader's research papers, each once reported as an identifier.
        "Similar to the earlier MATH23K benchmark163 and the hybrid MWP dataset,164 SVAMP85",
        "Die Bahn kommt bei20Minuten Verspätung an.",
        "Claude ZS Exp 0.89 9.79 (+3.83) 30.00(+3.33) 0.74 17.34 (−4.53) 52.94(−12.75)",  # noqa: RUF001
        "The concept of self-education via CoT reasoning69 suggests that LLMs",
        "tasks implemented via ConceptNet 5.5,183 an open graph",
        "Curran Associates, Inc. (2024). https://doi.org/10.52202/079017-2340.",
        # From annual reports and technical books.
        "Energética Sostenible, S.A. Bilbao 60,000 EUR 3,191 3,037 154 165 20 100%",
        "SunE Solar IV LLC Delaware -943,796 USD 1,909 2,825 -916 141 71 1,182 161",
        "1.64780994e-01, 6.02803867e-05, 1.96041560e-03",
        "R = {a1a5, a1a2a5, a1a5a6, a1a2a5a6}",
        "In October 2024, the Court ordered that official certificates be obtained",
        "the 18 stores expected to take place until 30 April",
        "63669.05791727153 {'max_features': 2, 'n_estimators': 3}",
    ],
)
def test_text_that_only_looks_like_an_identifier_is_not_reported(text):
    import complydoc as cd

    assert _by_pattern(cd.scan_text(text).matches) == []


def test_the_identifiers_those_rules_guard_are_still_found():
    import complydoc as cd

    text = (
        "Call +351 21 001 2834 or (+33) 1 42 68 53 00. Card number: 4 111 1111 1111 1111. "
        "Offices at 5000 Forbes Avenue and Via Machiavelli 35, Manchester M1 9BB."
    )
    assert _by_pattern(cd.scan_text(text).matches) == [
        "International phone number",
        "International phone number",
        "Payment card number",
        "Street address",
        "Street address",
        "UK postcode",
    ]


def test_a_format_check_is_not_a_checksum():
    """A phone number has no check digit, so on its own it is a pattern, not confirmed."""
    import complydoc as cd

    [match] = cd.scan_text("Reach us on +351 21 001 2834.").matches
    assert match.evidence == "pattern"
