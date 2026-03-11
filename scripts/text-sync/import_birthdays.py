"""Import birthdays from Apple Contacts as LifeEvent records.

For each Apple Contact with a birthday field, find the matching network
Contact via phone lookup and upsert a recurring LifeEvent with
event_type='birthday'.
"""
import sqlite3
import uuid
from datetime import datetime

from config import NETWORK_DB_PATH


def parse_birthday(bday_str: str) -> str | None:
    """Parse macOS AppleScript birthday string to YYYY-MM-DD format.

    Known formats:
    - "Wednesday, January 17, 1990 at 12:00:00 PM"
    - "January 17, 1990"
    - "1990-01-17"
    Returns None if unparseable.
    """
    if not bday_str or "missing value" in bday_str:
        return None

    bday_str = bday_str.strip()

    # Strip time component: "at HH:MM:SS AM/PM"
    if " at " in bday_str:
        bday_str = bday_str.split(" at ")[0].strip()

    # Try dateutil first
    try:
        from dateutil.parser import parse as date_parse
        dt = date_parse(bday_str)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        pass

    # Fallback: strip leading day name ("Wednesday, ")
    for day_name in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
        if bday_str.startswith(day_name):
            bday_str = bday_str[len(day_name):].lstrip(", ").strip()
            break

    # Try common formats manually
    for fmt in ["%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y"]:
        try:
            dt = datetime.strptime(bday_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def import_birthdays(
    apple_contacts: list[dict],
    network_lookup: dict[str, dict],
    db_path: str = NETWORK_DB_PATH,
) -> int:
    """Import birthday data from Apple Contacts as LifeEvent records.

    Args:
        apple_contacts: List of Apple Contact dicts from fetch_apple_contacts()
        network_lookup: Phone→network contact lookup from build_network_phone_lookup()
        db_path: Path to the network database

    Returns:
        Count of birthdays imported/updated.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    imported = 0
    seen_contact_ids = set()

    for ac in apple_contacts:
        bday_raw = ac.get("birthday")
        if not bday_raw or "missing value" in bday_raw:
            continue

        bday_date = parse_birthday(bday_raw)
        if not bday_date:
            continue

        # Find matching network contact via any of this Apple Contact's phones
        contact_id = None
        for phone in ac.get("phones", []):
            net = network_lookup.get(phone)
            if net:
                contact_id = net["id"]
                break

        if not contact_id or contact_id in seen_contact_ids:
            continue

        seen_contact_ids.add(contact_id)

        # Check if birthday LifeEvent already exists for this contact
        existing = conn.execute(
            "SELECT id, event_date FROM life_events WHERE contact_id = ? AND event_type = 'birthday'",
            (contact_id,),
        ).fetchone()

        contact_name = ac.get("name", "")
        description = f"{contact_name}'s Birthday"

        if existing:
            # Update if date is different
            if existing["event_date"] != bday_date:
                conn.execute(
                    "UPDATE life_events SET event_date = ?, description = ? WHERE id = ?",
                    (bday_date, description, existing["id"]),
                )
                imported += 1
        else:
            conn.execute(
                """INSERT INTO life_events (id, contact_id, event_type, event_date,
                   description, recurring, person)
                   VALUES (?, ?, 'birthday', ?, ?, 1, ?)""",
                (str(uuid.uuid4()), contact_id, bday_date, description, contact_name),
            )
            imported += 1

    conn.commit()
    conn.close()
    return imported


if __name__ == "__main__":
    from import_contacts import fetch_apple_contacts, build_phone_lookup
    from contact_matcher import get_network_contacts, build_network_phone_lookup

    apple_contacts = fetch_apple_contacts()
    network_contacts = get_network_contacts()
    network_lookup = build_network_phone_lookup(network_contacts)

    count = import_birthdays(apple_contacts, network_lookup)
    print(f"Imported {count} birthdays")
