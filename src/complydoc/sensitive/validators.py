"""Checksum and format validators.

A regex alone produces far too many false positives on business documents, which
are full of reference numbers that look like identifiers. These run after the
regex and discard anything that fails, so the counts in the report mean
something.
"""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Callable

__all__ = ["VALIDATORS", "iban_mod97", "luhn", "validate", "vat_mod97"]

# Neither of these letters may start a National Insurance prefix, and a handful
# of two-letter pairs are administratively reserved.
_NI_INVALID_FIRST = set("DFIQUV")
_NI_INVALID_SECOND = set("DFIOQUV")
_NI_RESERVED_PAIRS = {"BG", "GB", "NK", "KN", "TN", "NT", "ZZ"}

_UK_POSTCODE = re.compile(
    r"^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)"
    r"|[0-9][A-HJKPS-UW]) ?[0-9][ABD-HJLNP-UW-Z]{2})$",
    re.IGNORECASE,
)

_VALID_UK_PHONE_PREFIXES = ("01", "02", "03", "05", "07", "08", "09")


def _digits(value: str) -> str:
    return "".join(c for c in value if c.isdigit())


def _luhn_valid(digits: str) -> bool:
    total = 0
    for index, char in enumerate(reversed(digits)):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def luhn(value: str) -> bool:
    """The Luhn checksum used by payment cards, on 12 to 19 digits."""
    digits = _digits(value)
    return 12 <= len(digits) <= 19 and _luhn_valid(digits)


_CARD_ISSUERS: tuple[tuple[str, str, frozenset[int]], ...] = (
    # (lowest prefix, highest prefix, valid lengths) — prefixes compared as
    # equal-length digit strings.
    ("4", "4", frozenset({13, 16, 19})),  # Visa
    ("51", "55", frozenset({16})),  # Mastercard
    ("2221", "2720", frozenset({16})),  # Mastercard 2-series
    ("34", "34", frozenset({15})),  # American Express
    ("37", "37", frozenset({15})),  # American Express
    ("6011", "6011", frozenset(range(16, 20))),  # Discover
    ("644", "649", frozenset(range(16, 20))),  # Discover
    ("65", "65", frozenset(range(16, 20))),  # Discover
    ("300", "305", frozenset(range(14, 20))),  # Diners Club
    ("36", "36", frozenset(range(14, 20))),  # Diners Club
    ("38", "39", frozenset(range(14, 20))),  # Diners Club
    ("3528", "3589", frozenset(range(16, 20))),  # JCB
    ("62", "62", frozenset(range(16, 20))),  # UnionPay
    ("50", "50", frozenset(range(12, 20))),  # Maestro
    ("56", "69", frozenset(range(12, 20))),  # Maestro
    ("2200", "2204", frozenset(range(16, 20))),  # Mir
    ("60", "60", frozenset({16})),  # RuPay
    ("81", "82", frozenset({16})),  # RuPay
    ("508", "508", frozenset({16})),  # RuPay
    ("1", "1", frozenset({15})),  # UATP
)


def card_issuer(value: str) -> bool:
    """Whether the number starts with a card network's prefix and has its length.

    Luhn alone passes one digit string in ten, so on its own it confirms far
    more than card numbers: a PDF creation date, `D:20260909103836`, is fourteen
    digits that satisfy it. Every card network assigns numbers from published
    prefix ranges at fixed lengths, and a timestamp or an order number almost
    never falls inside one, so the two checks together are what a confirmed
    card number means.
    """
    digits = _digits(value)
    for low, high, lengths in _CARD_ISSUERS:
        prefix = digits[: len(low)]
        if len(prefix) == len(low) and low <= prefix <= high and len(digits) in lengths:
            return True
    return False


def iban_mod97(value: str) -> bool:
    """ISO 13616: move the first four characters to the end, then mod 97 must be 1."""
    cleaned = "".join(value.split()).upper()
    if not 15 <= len(cleaned) <= 34 or not cleaned[:2].isalpha() or not cleaned[2:4].isdigit():
        return False
    rearranged = cleaned[4:] + cleaned[:4]
    converted = ""
    for char in rearranged:
        if char.isdigit():
            converted += char
        elif char.isalpha():
            converted += str(ord(char) - 55)
        else:
            return False
    try:
        return int(converted) % 97 == 1
    except ValueError:
        return False


def ni_prefix(value: str) -> bool:
    cleaned = "".join(value.split()).upper()
    if len(cleaned) < 2:
        return False
    first, second = cleaned[0], cleaned[1]
    if first in _NI_INVALID_FIRST or second in _NI_INVALID_SECOND:
        return False
    return cleaned[:2] not in _NI_RESERVED_PAIRS


def vat_mod97(value: str) -> bool:
    """UK VAT: both the original mod-97 rule and the later 9755 variant are accepted."""
    digits = _digits(value)
    if len(digits) not in (9, 12):
        return False
    body, check = digits[:7], int(digits[7:9])
    weighted = sum(int(d) * w for d, w in zip(body, (8, 7, 6, 5, 4, 3, 2), strict=True))
    return (weighted + check) % 97 == 0 or (weighted + 55 + check) % 97 == 0


def sort_code(value: str) -> bool:
    digits = _digits(value)
    # Six digits, and not an obviously fake run like 000000 or 111111.
    return len(digits) == 6 and len(set(digits)) > 1


def uk_postcode(value: str) -> bool:
    return bool(_UK_POSTCODE.match(value.strip()))


def uk_phone(value: str) -> bool:
    cleaned = "".join(value.split()).replace("-", "")
    if cleaned.startswith("+44"):
        cleaned = "0" + cleaned[3:]
    digits = _digits(cleaned)
    if len(digits) not in (10, 11):
        return False
    return digits.startswith(_VALID_UK_PHONE_PREFIXES)


def plausible_dob(value: str) -> bool:
    """A date that could belong to a living person."""
    today = dt.date.today()
    candidates = (
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%d/%m/%y",
        "%d %b %Y",
        "%d %B %Y",
        "%Y-%m-%d",
    )
    text = " ".join(value.split())
    for fmt in candidates:
        try:
            parsed = dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
        age = (today - parsed).days / 365.25
        return 0 <= age <= 120
    return False


# --- other jurisdictions ---------------------------------------------------


def _weighted_mod(digits: str, weights: tuple[int, ...], modulus: int) -> int:
    return sum(int(d) * w for d, w in zip(digits, weights, strict=True)) % modulus


def us_ssn(value: str) -> bool:
    """US Social Security number, by the SSA's published exclusions."""
    digits = _digits(value)
    if len(digits) != 9:
        return False
    area, group, serial = digits[:3], digits[3:5], digits[5:]
    if area in {"000", "666"} or area.startswith("9"):
        return False
    return group != "00" and serial != "0000"


def us_ein(value: str) -> bool:
    digits = _digits(value)
    # Only the shape and a valid campus prefix; the EIN carries no checksum.
    return len(digits) == 9 and digits[:2] not in {"00", "07", "08", "09", "17", "18", "19"}


def aba_routing(value: str) -> bool:
    """US bank routing number, ABA checksum."""
    digits = _digits(value)
    if len(digits) != 9:
        return False
    return _weighted_mod(digits, (3, 7, 1, 3, 7, 1, 3, 7, 1), 10) == 0


def nl_bsn(value: str) -> bool:
    """Dutch citizen number, the eleven-proof."""
    digits = _digits(value)
    if len(digits) != 9 or digits == "0" * 9:
        return False
    total = sum(int(d) * w for d, w in zip(digits, (9, 8, 7, 6, 5, 4, 3, 2, -1), strict=True))
    return total % 11 == 0


def pt_nif(value: str) -> bool:
    """Portuguese tax number, mod-11 check digit."""
    digits = _digits(value)
    if len(digits) != 9 or digits[0] not in "125689":
        return False
    total = sum(int(d) * (9 - i) for i, d in enumerate(digits[:8]))
    check = 11 - (total % 11)
    return int(digits[8]) == (0 if check >= 10 else check)


def es_dni(value: str) -> bool:
    """Spanish DNI or NIE, letter derived from the number mod 23."""
    cleaned = "".join(value.split()).upper().replace("-", "")
    if len(cleaned) != 9:
        return False
    body, letter = cleaned[:8], cleaned[8]
    prefix = {"X": "0", "Y": "1", "Z": "2"}
    if body[0] in prefix:
        body = prefix[body[0]] + body[1:]
    if not body.isdigit() or not letter.isalpha():
        return False
    return "TRWAGMYFPDXBNJZSQVHLCKE"[int(body) % 23] == letter


def ie_pps(value: str) -> bool:
    """Irish PPS number: seven digits, a check letter, optionally a second letter."""
    cleaned = "".join(value.split()).upper()
    if len(cleaned) not in (8, 9) or not cleaned[:7].isdigit():
        return False
    total = sum(int(d) * (8 - i) for i, d in enumerate(cleaned[:7]))
    if len(cleaned) == 9 and cleaned[8].isalpha():
        total += (ord(cleaned[8]) - 64) * 9
    return "WABCDEFGHIJKLMNOPQRSTUV"[total % 23] == cleaned[7]


def fr_nir(value: str) -> bool:
    """French social security number, mod-97 check on the first thirteen digits."""
    cleaned = "".join(value.split()).upper()
    body = cleaned[:13].replace("2A", "19").replace("2B", "18")
    check = cleaned[13:15]
    if not body.isdigit() or not check.isdigit():
        return False
    return int(check) == 97 - (int(body) % 97)


def de_steuer_id(value: str) -> bool:
    """German tax identification number: eleven digits, ISO 7064 check digit."""
    digits = _digits(value)
    if len(digits) != 11:
        return False
    # Exactly one digit repeats in the first ten, which is what distinguishes a
    # real Steuer-ID from an arbitrary eleven-digit run.
    counts = {d: digits[:10].count(d) for d in set(digits[:10])}
    if sorted(counts.values(), reverse=True)[0] not in (2, 3):
        return False
    product = 10
    for digit in digits[:10]:
        total = (int(digit) + product) % 10 or 10
        product = (2 * total) % 11
    check = (11 - product) % 10
    return check == int(digits[10])


def eu_vat(value: str) -> bool:
    """Any EU or UK VAT number by country prefix and length."""
    cleaned = "".join(value.split()).upper().replace("-", "")
    if len(cleaned) < 4 or not cleaned[:2].isalpha():
        return False
    country, body = cleaned[:2], cleaned[2:]
    lengths = {
        "AT": (9,),
        "BE": (10,),
        "BG": (9, 10),
        "CY": (9,),
        "CZ": (8, 9, 10),
        "DE": (9,),
        "DK": (8,),
        "EE": (9,),
        "EL": (9,),
        "ES": (9,),
        "FI": (8,),
        "FR": (11,),
        "GB": (9, 12),
        "HR": (11,),
        "HU": (8,),
        "IE": (8, 9),
        "IT": (11,),
        "LT": (9, 12),
        "LU": (8,),
        "LV": (11,),
        "MT": (8,),
        "NL": (12,),
        "PL": (10,),
        "PT": (9,),
        "RO": tuple(range(2, 11)),
        "SE": (12,),
        "SI": (8,),
        "SK": (10,),
    }
    if country not in lengths or len(body) not in lengths[country]:
        return False
    if country == "GB":
        return vat_mod97(body)
    return any(c.isdigit() for c in body)


def _plausible_date(day: int, month: int) -> bool:
    return 1 <= month <= 12 and 1 <= day <= 31


def e164_phone(value: str) -> bool:
    """An international number with a country code, other than +44, of 8 to 15 digits."""
    digits = _digits(value)
    return value.strip().startswith("+") and 8 <= len(digits) <= 15 and not digits.startswith("44")


def nanp_phone(value: str) -> bool:
    """A North American number: area code and exchange each start with 2 to 9."""
    digits = _digits(value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return len(digits) == 10 and digits[0] in "23456789" and digits[3] in "23456789"


_CF_ODD = dict(zip("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20,
     11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23], strict=True))  # fmt: skip


def it_codice_fiscale(value: str) -> bool:
    """Italian tax code: sixteen characters, check letter from odd and even position tables."""
    code = "".join(value.split()).upper()
    if len(code) != 16 or not code.isalnum():
        return False
    total = 0
    for position, char in enumerate(code[:15]):
        if position % 2 == 0:
            total += _CF_ODD[char]
        else:
            total += int(char) if char.isdigit() else ord(char) - 65
    return chr(total % 26 + 65) == code[15]


def be_national_number(value: str) -> bool:
    """Belgian national register number: mod-97 check, with a 2 prefix for births from 2000."""
    digits = _digits(value)
    if len(digits) != 11:
        return False
    body, check = digits[:9], int(digits[9:])
    return check in (97 - int(body) % 97, 97 - int("2" + body) % 97)


def pl_pesel(value: str) -> bool:
    """Polish PESEL: weighted mod-10 check digit."""
    digits = _digits(value)
    if len(digits) != 11:
        return False
    total = _weighted_mod(digits[:10], (1, 3, 7, 9, 1, 3, 7, 9, 1, 3), 10)
    return (10 - total) % 10 == int(digits[10])


def se_personnummer(value: str) -> bool:
    """Swedish personal identity number: a date, a serial and a Luhn check digit."""
    digits = _digits(value)
    if len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10:
        return False
    day = int(digits[4:6])
    # Coordination numbers add 60 to the day.
    return _plausible_date(day - 60 if day > 60 else day, int(digits[2:4])) and _luhn_valid(digits)


def dk_cpr(value: str) -> bool:
    """Danish CPR number: a DDMMYY date and a four-digit serial. It has no checksum."""
    digits = _digits(value)
    return len(digits) == 10 and _plausible_date(int(digits[:2]), int(digits[2:4]))


def ch_ahv(value: str) -> bool:
    """Swiss AHV number: 756, then an EAN-13 check digit."""
    digits = _digits(value)
    if len(digits) != 13 or not digits.startswith("756"):
        return False
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(digits[:12]))
    return (10 - total % 10) % 10 == int(digits[12])


def _mod11_digit(digits: str, weights: range | tuple[int, ...]) -> int:
    remainder = sum(int(d) * w for d, w in zip(digits, weights, strict=True)) % 11
    return 0 if remainder < 2 else 11 - remainder


def br_cpf(value: str) -> bool:
    """Brazilian CPF: two mod-11 check digits."""
    digits = _digits(value)
    if len(digits) != 11 or len(set(digits)) == 1:
        return False
    first = _mod11_digit(digits[:9], range(10, 1, -1))
    second = _mod11_digit(digits[:10], range(11, 1, -1))
    return digits[9:] == f"{first}{second}"


def br_cnpj(value: str) -> bool:
    """Brazilian CNPJ: two mod-11 check digits."""
    digits = _digits(value)
    if len(digits) != 14 or len(set(digits)) == 1:
        return False
    first = _mod11_digit(digits[:12], (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    second = _mod11_digit(digits[:13], (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return digits[12:] == f"{first}{second}"


_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9), (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6), (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8), (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2), (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4), (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)  # fmt: skip
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9), (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2), (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0), (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5), (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)  # fmt: skip


def verhoeff(value: str) -> bool:
    checksum = 0
    for position, digit in enumerate(reversed(_digits(value))):
        checksum = _VERHOEFF_D[checksum][_VERHOEFF_P[position % 8][int(digit)]]
    return checksum == 0


def in_aadhaar(value: str) -> bool:
    """Indian Aadhaar number: twelve digits, not starting 0 or 1, Verhoeff check digit."""
    digits = _digits(value)
    return len(digits) == 12 and digits[0] not in "01" and verhoeff(digits)


def in_pan(value: str) -> bool:
    """Indian PAN: five letters, four digits, a letter; the fourth letter is the holder type."""
    code = "".join(value.split()).upper()
    return (
        len(code) == 10
        and code[:5].isalpha()
        and code[5:9].isdigit()
        and code[9].isalpha()
        and code[3] in "ABCFGHJLPT"
    )


def ca_sin(value: str) -> bool:
    """Canadian Social Insurance Number: nine digits, Luhn, not starting 0 or 8."""
    digits = _digits(value)
    return len(digits) == 9 and digits[0] not in "08" and _luhn_valid(digits)


def au_tfn(value: str) -> bool:
    """Australian Tax File Number: nine digits with a weighted mod-11 check."""
    digits = _digits(value)
    if len(digits) != 9:
        return False
    return _weighted_mod(digits, (1, 4, 3, 7, 5, 8, 6, 9, 10), 11) == 0


VALIDATORS: dict[str, Callable[[str], bool]] = {
    "luhn": luhn,
    "card_issuer": card_issuer,
    "iban_mod97": iban_mod97,
    "ni_prefix": ni_prefix,
    "vat_mod97": vat_mod97,
    "sort_code": sort_code,
    "uk_postcode": uk_postcode,
    "uk_phone": uk_phone,
    "plausible_dob": plausible_dob,
    "us_ssn": us_ssn,
    "us_ein": us_ein,
    "aba_routing": aba_routing,
    "nl_bsn": nl_bsn,
    "pt_nif": pt_nif,
    "es_dni": es_dni,
    "ie_pps": ie_pps,
    "fr_nir": fr_nir,
    "de_steuer_id": de_steuer_id,
    "eu_vat": eu_vat,
    "e164_phone": e164_phone,
    "nanp_phone": nanp_phone,
    "it_codice_fiscale": it_codice_fiscale,
    "be_national_number": be_national_number,
    "pl_pesel": pl_pesel,
    "se_personnummer": se_personnummer,
    "dk_cpr": dk_cpr,
    "ch_ahv": ch_ahv,
    "br_cpf": br_cpf,
    "br_cnpj": br_cnpj,
    "in_aadhaar": in_aadhaar,
    "in_pan": in_pan,
    "ca_sin": ca_sin,
    "au_tfn": au_tfn,
}


def validate(value: str, names: list[str]) -> tuple[bool, list[str]]:
    """Run the named validators. Returns (all passed, names that passed)."""
    passed: list[str] = []
    for name in names:
        checker = VALIDATORS.get(name)
        if checker is None:
            continue
        if not checker(value):
            return False, passed
        passed.append(name)
    return True, passed
