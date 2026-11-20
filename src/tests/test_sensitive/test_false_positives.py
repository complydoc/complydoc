"""Reference numbers that look like identifiers, and the identifiers they must not hide.

Each case is a shape that produced a wrong flag on a benchmark of business documents:
a label matched inside another word, a label from the next line, an order number read
as a phone number, an IMEI read as a card. Every value is fake.
"""

from __future__ import annotations

import pytest

from complydoc.sensitive.scanner import scan_text
from complydoc.sensitive.validators import iban_mod97, pt_nif


def _found(text: str, config) -> set[tuple[str, str]]:
    matches, _ = scan_text(text, config.sensitive, reveal=True)
    return {(m.category, m.revealed or "") for m in matches}


def _categories(text: str, config) -> set[str]:
    return {category for category, _ in _found(text, config)}


def _patterns_only(found: set[str]) -> set[str]:
    return found - {"person_name", "organisation_name"}


def test_a_context_term_is_a_whole_word(config):
    # "ach" is a US routing-number label, and it is also in "Machado".
    text = "Largo Gabriela Machado\nCódigo cliente: 021000021"
    assert "us_routing_number" not in _categories(text, config)


def test_a_context_term_with_its_own_word_still_counts(config):
    assert "us_routing_number" in _categories("ACH routing: 021000021", config)


def test_a_capitalised_label_ocr_ran_into_the_next_word_still_counts(config):
    # OCR of a scanned invoice drops the space after the capitals: "NIF do cliente".
    assert "pt_nif" in _categories("NIFdocliente: 168567954", config)
    # A word that only starts like the label is not the label.
    assert "pt_nif" not in _categories("Nifty order 168567954", config)
    assert "pt_nif" not in _categories("NIFTY order 168567954", config)


def test_a_label_on_the_next_line_belongs_to_the_next_field(config):
    text = "Meter reading 727611 kWh, 08/08/1996\nData de nascimento: 14/03/1985"
    found = _found(text, config)
    assert ("date_of_birth", "14/03/1985") in found
    assert not any(value == "08/08/1996" for _, value in found)


def test_a_value_under_its_label_on_the_line_above_is_found(config):
    assert ("pt_nif", "123456789") in _found("NIF\n123456789", config)


def test_an_iban_must_have_its_countrys_length(config):
    # A CPE code is "PT0002" and 14 more characters; with the next word it can pass mod-97.
    assert iban_mod97("PT50000201231234567890154")
    assert not iban_mod97("PT50000201231234567890154" + "00")
    assert iban_mod97("GB82WEST12345698765432")


@pytest.mark.parametrize("nif", ["301234564", "451234561", "701234568"])
def test_newer_portuguese_nifs_are_valid(nif):
    total = sum(int(d) * (9 - i) for i, d in enumerate(nif[:8]))
    check = 11 - total % 11
    assert pt_nif(nif[:8] + str(0 if check >= 10 else check))


def test_a_portuguese_company_number_is_found_by_its_nipc_label(config):
    assert "pt_nif" in _categories("Ribeira Software, Lda., NIPC 509264972", config)


@pytest.mark.parametrize(
    "line",
    [
        "Encomenda: 0209396017",
        "Policy POL-0213149944",
        "Lote: 0144582741",
        "DHL 0283338855",
    ],
)
def test_a_reference_number_is_not_a_uk_phone_number(config, line):
    assert not _patterns_only(_categories(line, config))


def test_an_unspaced_uk_number_beside_a_phone_label_is_found(config):
    assert "phone_number" in _categories("Mobile: 07700900123", config)


@pytest.mark.parametrize(
    "line", ["IMEI 673501016503966", "EAN 6727500010691", "Lote: 4867978162859129"]
)
def test_digits_that_pass_luhn_are_not_a_card_without_a_card_word(config, line):
    assert "card_number" not in _categories(line, config)


def test_an_unbroken_card_number_beside_a_card_word_is_found(config):
    assert "card_number" in _categories("Card: 4111111111111111", config)


def test_a_grouped_card_number_is_a_card_whatever_its_label(config):
    assert "card_number" in _categories("Invoice number: 4111 1111 1111 1111", config)


def test_a_phone_number_is_not_a_tax_number_because_a_tax_label_is_near(config):
    text = "NIF: 509264972\nTel.: 222880546"
    found = _found(text, config)
    assert ("pt_nif", "509264972") in found
    assert not any(category == "pt_nif" and value == "222880546" for category, value in found)


def test_a_spaced_french_nir_is_not_also_a_phone_number(config):
    text = "N° de sécurité sociale: 1 80 07 65 427 829 51"
    found = _patterns_only(_categories(text, config))
    assert "fr_nir" in found
    assert not found & {"phone_number", "international_phone"}


def _civil_id(first_eight: str) -> str:
    total = sum(int(d) * w for d, w in zip(first_eight, range(9, 1, -1), strict=True))
    check = 11 - total % 11
    return first_eight + str(0 if check >= 10 else check)


def test_a_portuguese_civil_id_is_found_by_its_card_label(config):
    number = _civil_id("14325879")
    assert ("pt_civil_id", f"{number[:8]} {number[8]}") in _found(
        f"Cartão de Cidadão: {number[:8]} {number[8]} ZZ4", config
    )
    assert ("pt_civil_id", number) in _found(f"BI n.º {number}", config)
    wrong = number[:8] + str((int(number[8]) + 1) % 10)
    assert "pt_civil_id" not in _categories(f"Cartão de Cidadão: {wrong}", config)


def test_an_abbreviated_social_security_label_counts(config):
    assert "pt_niss" in _categories("N.º Seg. Social: 19458073020", config)


@pytest.mark.parametrize(
    ("line", "value"),
    [
        ("Telemóvel: 912 345 678", "912 345 678"),
        ("Ligar ao cliente: 935 840 923", "935 840 923"),
        ("Tel. 22 123 4567", "22 123 4567"),
        ("Contacto: 222880546", "222880546"),
    ],
)
def test_a_portuguese_number_without_its_country_code_is_found_beside_a_phone_label(
    config, line, value
):
    assert ("pt_phone", value) in _found(line, config)


@pytest.mark.parametrize("line", ["Encomenda: 912345678", "Lote 935840923", "Total 22 123 4567"])
def test_nine_digits_without_a_phone_label_are_not_a_portuguese_phone(config, line):
    assert "pt_phone" not in _categories(line, config)
