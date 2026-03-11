"""Phone number normalization utilities."""
import re
import phonenumbers


def normalize_phone(raw: str, default_region: str = "US") -> str | None:
    """Normalize a phone number to E.164 format (+12025551234).

    Returns None if the number can't be parsed.
    """
    if not raw:
        return None

    # Strip common formatting
    cleaned = raw.strip()

    # Handle iMessage email addresses (not phone numbers)
    if "@" in cleaned:
        return None

    try:
        parsed = phonenumbers.parse(cleaned, default_region)
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        pass

    # Fallback: try stripping non-digits and re-parsing
    digits = re.sub(r"[^\d+]", "", cleaned)
    if len(digits) < 7:
        return None

    try:
        # Add + prefix if it starts with country code
        if len(digits) == 11 and digits.startswith("1"):
            digits = "+" + digits
        elif len(digits) == 10:
            digits = "+1" + digits

        parsed = phonenumbers.parse(digits, default_region)
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        pass

    return None


def phones_match(a: str | None, b: str | None) -> bool:
    """Check if two phone numbers are the same after normalization."""
    if not a or not b:
        return False
    na = normalize_phone(a)
    nb = normalize_phone(b)
    return na is not None and na == nb
