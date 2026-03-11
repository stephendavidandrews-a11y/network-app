"""Match phone numbers from chat.db to network app contacts.

Four matching buckets:
1. In network app + have texts → Populate CommStats automatically
2. In Apple Contacts + have texts + NOT in network app → Triage queue candidates
3. In network app + no texts → CommStats stays empty
4. In chat.db but not in Apple Contacts → Unknown numbers, surface highest-volume only
"""
import sqlite3
import json
import sys
from phone_utils import normalize_phone
from config import NETWORK_DB_PATH


def get_network_contacts(db_path: str = NETWORK_DB_PATH) -> list[dict]:
    """Load all contacts from the network app database with their phone numbers."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, name, phone, contact_type, personal_ring, personal_cadence_days
        FROM contacts
        WHERE phone IS NOT NULL AND phone != ''
    """)

    contacts = []
    for row in cursor:
        normalized = normalize_phone(row["phone"])
        if normalized:
            contacts.append({
                "id": row["id"],
                "name": row["name"],
                "phone": normalized,
                "raw_phone": row["phone"],
                "contact_type": row["contact_type"],
                "personal_ring": row["personal_ring"],
                "cadence_days": row["personal_cadence_days"],
            })

    conn.close()
    return contacts


def build_network_phone_lookup(contacts: list[dict]) -> dict[str, dict]:
    """Build phone → network contact lookup."""
    lookup = {}
    for c in contacts:
        lookup[c["phone"]] = c
    return lookup


def classify_phone_numbers(
    message_phones: set[str],
    network_lookup: dict[str, dict],
    apple_lookup: dict[str, dict],
) -> dict[str, list]:
    """Classify phone numbers into the four buckets.

    Args:
        message_phones: Set of all normalized phone numbers found in chat.db messages
        network_lookup: phone → network contact dict
        apple_lookup: phone → apple contact dict

    Returns:
        dict with keys: bucket_1, bucket_2, bucket_3, bucket_4
    """
    buckets = {
        "bucket_1": [],  # In network app + have texts
        "bucket_2": [],  # In Apple Contacts + texts + NOT in network app
        "bucket_3": [],  # In network app + no texts (computed separately)
        "bucket_4": [],  # In chat.db but not in Apple Contacts
    }

    for phone in message_phones:
        in_network = phone in network_lookup
        in_apple = phone in apple_lookup

        if in_network:
            buckets["bucket_1"].append({
                "phone": phone,
                "network_contact": network_lookup[phone],
            })
        elif in_apple:
            buckets["bucket_2"].append({
                "phone": phone,
                "apple_contact": apple_lookup[phone],
            })
        else:
            buckets["bucket_4"].append({
                "phone": phone,
            })

    # Bucket 3: network contacts with no texts
    for phone, contact in network_lookup.items():
        if phone not in message_phones:
            buckets["bucket_3"].append({
                "phone": phone,
                "network_contact": contact,
            })

    return buckets


def fuzzy_match_name(name: str, network_contacts: list[dict], threshold: float = 0.75) -> list[dict]:
    """Find network contacts with similar names for triage suggestions.

    Returns list of potential matches sorted by similarity score.
    """
    if not name:
        return []

    name_lower = name.lower().strip()
    name_parts = set(name_lower.split())
    matches = []

    for contact in network_contacts:
        contact_name = contact["name"].lower().strip()
        contact_parts = set(contact_name.split())

        # Exact match
        if name_lower == contact_name:
            matches.append({"contact": contact, "score": 1.0, "match_type": "exact"})
            continue

        # Check if all parts of the shorter name appear in the longer name
        if name_parts.issubset(contact_parts) or contact_parts.issubset(name_parts):
            matches.append({"contact": contact, "score": 0.9, "match_type": "subset"})
            continue

        # Check first + last name overlap
        shared = name_parts & contact_parts
        if shared:
            score = len(shared) / max(len(name_parts), len(contact_parts))
            if score >= threshold:
                matches.append({"contact": contact, "score": score, "match_type": "partial"})

    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches[:3]  # Return top 3


def main():
    """Test contact matching standalone."""
    contacts = get_network_contacts()
    print(f"[contact_matcher] Network contacts with phones: {len(contacts)}")

    lookup = build_network_phone_lookup(contacts)
    print(f"[contact_matcher] Phone lookup entries: {len(lookup)}")

    # Show sample
    for phone, info in list(lookup.items())[:5]:
        print(f"  {phone} → {info['name']} ({info['contact_type']})")


if __name__ == "__main__":
    main()
