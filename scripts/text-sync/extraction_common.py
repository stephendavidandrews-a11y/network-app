"""Shared utilities for AI extraction pipeline."""
import json
import logging
import random
import sqlite3
import uuid
from datetime import datetime, timedelta

from config import (
    EXTRACTION_CLOSE_RING_DAYS,
    EXTRACTION_NEW_MESSAGE_THRESHOLD,
    EXTRACTION_REGULAR_RING_DAYS,
    MAX_MESSAGES_PER_CHUNK,
    VOICE_MIN_SENT_PER_CONTACT,
)

log = logging.getLogger("extraction")


# ---------------------------------------------------------------------------
# Eligibility queries
# ---------------------------------------------------------------------------

def get_eligible_contacts_factual(conn: sqlite3.Connection) -> list[dict]:
    """Find contacts eligible for factual extraction.

    Criteria:
    - contact_id is linked (not null)
    - 20+ total messages
    - Either: no factual extraction yet, OR
      20+ new messages since last extraction, OR
      past ring-based threshold (close=30d, regular/outer=90d)
    """
    cur = conn.execute("""
        SELECT
            cs.contact_id,
            cs.phone_number,
            cs.total_messages,
            c.name,
            c.contact_type,
            c.personal_ring,
            ep.last_extracted AS last_factual
        FROM text_contact_comm_stats cs
        JOIN contacts c ON c.id = cs.contact_id
        LEFT JOIN text_extraction_profiles ep
            ON ep.contact_id = cs.contact_id AND ep.extraction_type = 'factual'
        WHERE cs.contact_id IS NOT NULL
          AND cs.total_messages >= 20
        ORDER BY cs.total_weighted_score DESC
    """)

    now = datetime.utcnow()
    eligible = []

    for row in cur.fetchall():
        contact_id, phone, total_msgs, name, contact_type, ring, last_factual = row

        # No extraction yet — always eligible
        if not last_factual:
            eligible.append({
                "contact_id": contact_id,
                "phone_number": phone,
                "total_messages": total_msgs,
                "name": name,
                "contact_type": contact_type,
                "personal_ring": ring,
            })
            continue

        # Check time threshold based on ring
        try:
            last_dt = datetime.fromisoformat(last_factual.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, AttributeError):
            eligible.append({
                "contact_id": contact_id,
                "phone_number": phone,
                "total_messages": total_msgs,
                "name": name,
                "contact_type": contact_type,
                "personal_ring": ring,
            })
            continue

        threshold_days = EXTRACTION_CLOSE_RING_DAYS if ring == "close" else EXTRACTION_REGULAR_RING_DAYS
        if (now - last_dt).days >= threshold_days:
            eligible.append({
                "contact_id": contact_id,
                "phone_number": phone,
                "total_messages": total_msgs,
                "name": name,
                "contact_type": contact_type,
                "personal_ring": ring,
            })
            continue

        # Check new message count since last extraction
        new_count = conn.execute("""
            SELECT COUNT(*) FROM text_messages
            WHERE contact_id = ? AND timestamp > ?
        """, (contact_id, last_factual)).fetchone()[0]

        if new_count >= EXTRACTION_NEW_MESSAGE_THRESHOLD:
            eligible.append({
                "contact_id": contact_id,
                "phone_number": phone,
                "total_messages": total_msgs,
                "name": name,
                "contact_type": contact_type,
                "personal_ring": ring,
            })

    return eligible


def get_eligible_contacts_interpretive(conn: sqlite3.Connection) -> list[dict]:
    """Find contacts eligible for interpretive extraction.

    Criteria:
    - Has a factual extraction profile
    - Either: no interpretive extraction yet, OR interpretive >60 days old
    """
    cur = conn.execute("""
        SELECT
            fp.contact_id,
            c.name,
            c.contact_type,
            c.personal_ring,
            cs.total_messages,
            fp.id AS factual_profile_id,
            ip.last_extracted AS last_interpretive
        FROM text_extraction_profiles fp
        JOIN contacts c ON c.id = fp.contact_id
        JOIN text_contact_comm_stats cs ON cs.contact_id = fp.contact_id
        LEFT JOIN text_extraction_profiles ip
            ON ip.contact_id = fp.contact_id AND ip.extraction_type = 'interpretive'
        WHERE fp.extraction_type = 'factual'
        ORDER BY cs.total_weighted_score DESC
    """)

    now = datetime.utcnow()
    eligible = []

    for row in cur.fetchall():
        contact_id, name, contact_type, ring, total_msgs, factual_id, last_interpretive = row

        if not last_interpretive:
            eligible.append({
                "contact_id": contact_id,
                "name": name,
                "contact_type": contact_type,
                "personal_ring": ring,
                "total_messages": total_msgs,
                "factual_profile_id": factual_id,
            })
            continue

        try:
            last_dt = datetime.fromisoformat(last_interpretive.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, AttributeError):
            eligible.append({
                "contact_id": contact_id,
                "name": name,
                "contact_type": contact_type,
                "personal_ring": ring,
                "total_messages": total_msgs,
                "factual_profile_id": factual_id,
            })
            continue

        if (now - last_dt).days >= 60:
            eligible.append({
                "contact_id": contact_id,
                "name": name,
                "contact_type": contact_type,
                "personal_ring": ring,
                "total_messages": total_msgs,
                "factual_profile_id": factual_id,
            })

    return eligible


# ---------------------------------------------------------------------------
# Message fetching
# ---------------------------------------------------------------------------

def get_messages_for_contact(conn: sqlite3.Connection, contact_id: str) -> list[dict]:
    """Pull all 1:1 messages for a contact, ordered chronologically."""
    cur = conn.execute("""
        SELECT direction, content, timestamp
        FROM text_messages
        WHERE contact_id = ? AND is_group_message = 0
          AND content IS NOT NULL AND content != ''
        ORDER BY timestamp ASC
    """, (contact_id,))

    return [
        {"direction": row[0], "content": row[1], "timestamp": row[2]}
        for row in cur.fetchall()
    ]


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_messages(messages: list[dict], max_per_chunk: int = MAX_MESSAGES_PER_CHUNK) -> list[list[dict]]:
    """Split messages into chunks, preferring month boundaries."""
    if len(messages) <= max_per_chunk:
        return [messages]

    chunks = []
    current_chunk: list[dict] = []
    current_month = None

    for msg in messages:
        msg_month = msg["timestamp"][:7] if msg["timestamp"] else None  # YYYY-MM

        # If adding this message would exceed the limit and we're at a month boundary
        if len(current_chunk) >= max_per_chunk and msg_month != current_month:
            chunks.append(current_chunk)
            current_chunk = []

        current_chunk.append(msg)
        current_month = msg_month

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


# ---------------------------------------------------------------------------
# Merge chunked extractions
# ---------------------------------------------------------------------------

def merge_factual_extractions(extractions: list[dict]) -> dict:
    """Merge multiple chunk extractions into one."""
    if len(extractions) == 1:
        return extractions[0]

    confidence_rank = {"high": 3, "medium": 2, "low": 1}

    # Merge interests — union, keep highest confidence per interest
    interests_map: dict[str, dict] = {}
    for ext in extractions:
        for item in ext.get("interests") or []:
            key = (item.get("interest") or item.get("topic", "")).lower().strip()
            if not key:
                continue
            existing = interests_map.get(key)
            if not existing or confidence_rank.get(item.get("confidence", "low"), 0) > confidence_rank.get(existing.get("confidence", "low"), 0):
                interests_map[key] = item
    merged_interests = list(interests_map.values())

    # Merge activities — union, keep highest confidence
    activities_map: dict[str, dict] = {}
    for ext in extractions:
        for item in ext.get("activities") or []:
            key = (item.get("activity") or "").lower().strip()
            if not key:
                continue
            existing = activities_map.get(key)
            if not existing or confidence_rank.get(item.get("confidence", "low"), 0) > confidence_rank.get(existing.get("confidence", "low"), 0):
                activities_map[key] = item
    merged_activities = list(activities_map.values())

    # Merge life events — union, deduplicate by description
    seen_events: set[str] = set()
    merged_life_events: list[dict] = []
    for ext in extractions:
        for item in ext.get("lifeEvents") or []:
            desc = (item.get("description") or "").lower().strip()
            if desc and desc not in seen_events:
                seen_events.add(desc)
                merged_life_events.append(item)

    # Location signals — take from most recent chunk (last extraction)
    merged_location = {}
    for ext in extractions:
        loc = ext.get("locationSignals")
        if loc and any(v and v.get("value") for v in loc.values() if isinstance(v, dict)):
            merged_location = loc

    # Key people — union by name
    people_map: dict[str, dict] = {}
    for ext in extractions:
        for item in ext.get("keyPeopleMentioned") or []:
            name = (item.get("name") or "").lower().strip()
            if name:
                people_map[name] = item
    merged_people = list(people_map.values())

    # Open threads — from most recent chunk, cap at 5
    merged_threads: list[dict] = []
    for ext in reversed(extractions):
        for item in ext.get("openThreads") or []:
            if len(merged_threads) < 5:
                merged_threads.append(item)

    # How we met — prefer earliest chunk
    how_we_met = None
    for ext in extractions:
        if ext.get("howWeMetSignal"):
            how_we_met = ext["howWeMetSignal"]
            break

    # Topics — union
    all_topics: set[str] = set()
    for ext in extractions:
        for t in ext.get("typicalTopics") or []:
            all_topics.add(t)

    # Availability — from most recent chunk
    availability = None
    for ext in reversed(extractions):
        if ext.get("availabilityPatterns"):
            availability = ext["availabilityPatterns"]
            break

    return {
        "interests": merged_interests,
        "activities": merged_activities,
        "lifeEvents": merged_life_events,
        "locationSignals": merged_location,
        "keyPeopleMentioned": merged_people,
        "howWeMetSignal": how_we_met,
        "typicalTopics": list(all_topics),
        "availabilityPatterns": availability,
        "openThreads": merged_threads,
    }


# ---------------------------------------------------------------------------
# Database writes
# ---------------------------------------------------------------------------

def upsert_extraction_profile(
    conn: sqlite3.Connection,
    contact_id: str,
    extraction_type: str,
    data: dict,
) -> str:
    """Insert or update a TextExtractionProfile row. Returns the profile ID."""
    now = datetime.utcnow().isoformat() + "Z"

    # Check for existing profile
    existing = conn.execute("""
        SELECT id FROM text_extraction_profiles
        WHERE contact_id = ? AND extraction_type = ?
    """, (contact_id, extraction_type)).fetchone()

    if extraction_type == "factual":
        fields = {
            "interests": json.dumps(data.get("interests") or []),
            "activities": json.dumps(data.get("activities") or []),
            "life_events": json.dumps(data.get("lifeEvents") or []),
            "location_signals": json.dumps(data.get("locationSignals") or {}),
            "key_people_mentioned": json.dumps(data.get("keyPeopleMentioned") or []),
            "how_we_met_signal": data.get("howWeMetSignal"),
            "typical_topics": json.dumps(data.get("typicalTopics") or []),
            "availability_patterns": data.get("availabilityPatterns"),
            "open_threads": json.dumps(data.get("openThreads") or []),
        }
    else:  # interpretive
        fields = {
            "communication_style": data.get("communicationStyle"),
            "personality_read": json.dumps(data.get("personalityRead")) if data.get("personalityRead") else None,
            "emotional_availability": data.get("emotionalAvailability"),
            "humor_style": data.get("humorStyle"),
            "reliability_signal": data.get("reliabilitySignal"),
            "what_they_care_about": data.get("whatTheyCareAbout"),
            "how_they_see_you": data.get("howTheySeeYou"),
            "relationship_arc": data.get("relationshipArc"),
            "warmth_signal": data.get("warmthSignal"),
            "initiation_pattern": data.get("initiationPattern"),
            "working_style": data.get("workingStyle"),
            "strategic_priorities": data.get("strategicPriorities"),
            "what_they_want_from_you": data.get("whatTheyWantFromYou"),
            "summary": data.get("summary"),
            "pre_outreach_brief": data.get("preOutreachBrief"),
        }

    if existing:
        profile_id = existing[0]
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE text_extraction_profiles SET {set_clause}, last_extracted = ? WHERE id = ?",
            [*fields.values(), now, profile_id],
        )
    else:
        profile_id = str(uuid.uuid4())
        columns = ["id", "contact_id", "extraction_type", *fields.keys(), "last_extracted"]
        placeholders = ", ".join("?" for _ in columns)
        conn.execute(
            f"INSERT INTO text_extraction_profiles ({', '.join(columns)}) VALUES ({placeholders})",
            [profile_id, contact_id, extraction_type, *fields.values(), now],
        )

    return profile_id


def push_location_to_contact(
    conn: sqlite3.Connection,
    contact_id: str,
    location_signals: dict | None,
) -> None:
    """Push medium/high confidence location data to the Contact record."""
    if not location_signals:
        return

    updates: dict[str, str] = {}
    field_map = {
        "city": "city",
        "stateRegion": "state_region",
        "neighborhood": "neighborhood",
    }

    for signal_key, db_field in field_map.items():
        signal = location_signals.get(signal_key)
        if not signal or not isinstance(signal, dict):
            continue
        value = signal.get("value")
        confidence = signal.get("confidence", "low")
        if value and confidence in ("medium", "high"):
            # Only update if Contact field is currently empty
            current = conn.execute(
                f"SELECT {db_field} FROM contacts WHERE id = ?", (contact_id,)
            ).fetchone()
            if current and not current[0]:
                updates[db_field] = value

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE contacts SET {set_clause} WHERE id = ?",
            [*updates.values(), contact_id],
        )
        log.info(f"  Pushed location to contact: {updates}")


def push_interests_activities(
    conn: sqlite3.Connection,
    contact_id: str,
    interests: list[dict] | None,
    activities: list[dict] | None,
) -> None:
    """Upsert PersonalInterest and PersonalActivity rows from extraction."""
    if interests:
        for item in interests:
            interest_name = item.get("interest") or item.get("topic", "")
            if not interest_name:
                continue
            confidence = item.get("confidence", "medium")
            # Check if already exists
            existing = conn.execute(
                "SELECT id FROM personal_interests WHERE contact_id = ? AND LOWER(interest) = LOWER(?)",
                (contact_id, interest_name),
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO personal_interests (id, contact_id, interest, confidence, source) VALUES (?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), contact_id, interest_name, confidence, "text_extraction"),
                )

    if activities:
        for item in activities:
            activity_name = item.get("activity", "")
            if not activity_name:
                continue
            frequency = item.get("frequency", "occasional")
            # Check if already exists
            existing = conn.execute(
                "SELECT id FROM personal_activities WHERE contact_id = ? AND LOWER(activity) = LOWER(?)",
                (contact_id, activity_name),
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO personal_activities (id, contact_id, activity, frequency, source) VALUES (?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), contact_id, activity_name, frequency, "text_extraction"),
                )


def push_life_events(
    conn: sqlite3.Connection,
    contact_id: str,
    life_events: list[dict] | None,
) -> None:
    """Upsert LifeEvent rows from factual extraction results.

    Maps extraction eventType strings to the LifeEvent enum.
    Deduplicates by checking for existing events with similar descriptions.
    """
    if not life_events:
        return

    valid_event_types = {
        "birthday", "anniversary", "child_birth", "move", "job_change",
        "graduation", "engagement", "wedding", "health", "loss",
        "milestone", "custom",
    }

    # Get contact name for the `person` field (NOT NULL in schema)
    row = conn.execute("SELECT name FROM contacts WHERE id = ?", (contact_id,)).fetchone()
    contact_name = row[0] if row else ""

    for item in life_events:
        description = (item.get("description") or "").strip()
        if not description:
            continue

        event_type = (item.get("eventType") or item.get("event_type") or "custom").lower()
        if event_type not in valid_event_types:
            event_type = "custom"

        event_date = item.get("date") or item.get("date_approximate")
        # Normalize partial dates: "2024-01" → "2024-01-01"
        if event_date and len(event_date) == 7:
            event_date = event_date + "-01"
        elif event_date and len(event_date) == 4:
            event_date = event_date + "-01-01"

        recurring = 1 if event_type == "birthday" else 0

        # Dedup: check for existing event with similar description
        existing = conn.execute(
            "SELECT id FROM life_events WHERE contact_id = ? AND LOWER(description) = LOWER(?)",
            (contact_id, description),
        ).fetchone()

        if not existing:
            conn.execute(
                """INSERT INTO life_events (id, contact_id, event_type, event_date,
                   description, recurring, person)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), contact_id, event_type, event_date, description, recurring, contact_name),
            )


def get_factual_profile(conn: sqlite3.Connection, contact_id: str) -> dict | None:
    """Load the factual extraction profile for a contact."""
    row = conn.execute("""
        SELECT interests, activities, life_events, location_signals,
               key_people_mentioned, how_we_met_signal, typical_topics,
               availability_patterns, open_threads, last_extracted
        FROM text_extraction_profiles
        WHERE contact_id = ? AND extraction_type = 'factual'
    """, (contact_id,)).fetchone()

    if not row:
        return None

    return {
        "interests": _parse_json(row[0], []),
        "activities": _parse_json(row[1], []),
        "lifeEvents": _parse_json(row[2], []),
        "locationSignals": _parse_json(row[3], {}),
        "keyPeopleMentioned": _parse_json(row[4], []),
        "howWeMetSignal": row[5],
        "typicalTopics": _parse_json(row[6], []),
        "availabilityPatterns": row[7],
        "openThreads": _parse_json(row[8], []),
        "lastExtracted": row[9],
    }


def format_messages_for_prompt(messages: list[dict]) -> str:
    """Format messages for inclusion in an extraction prompt."""
    lines = []
    for msg in messages:
        ts = msg["timestamp"][:16] if msg["timestamp"] else "unknown"
        prefix = "S" if msg["direction"] == "sent" else "R"
        content = msg["content"]
        # Truncate very long messages
        if len(content) > 500:
            content = content[:500] + "..."
        lines.append(f"[{ts}] {prefix}: {content}")
    return "\n".join(lines)


def parse_json_response(text: str) -> dict | None:
    """Parse JSON from Claude's response, handling markdown code blocks."""
    # Try direct parse
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from code block
    if "```" in text:
        # Find JSON between code fences
        parts = text.split("```")
        for part in parts[1::2]:  # odd-indexed parts are inside fences
            candidate = part.strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    return None


def _parse_json(value: str | None, default):
    """Safely parse a JSON string field."""
    if not value:
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default


# ---------------------------------------------------------------------------
# Voice profiling helpers
# ---------------------------------------------------------------------------

# Catherine Cole — fiancée excluded from voice profiling (distinct register)
VOICE_EXCLUDE_CONTACT_IDS = {"550de687-d8db-498d-b12c-809aa9d4b595"}


def get_sent_messages_for_contact(conn: sqlite3.Connection, contact_id: str) -> list[dict]:
    """Pull all SENT 1:1 messages for a contact, ordered chronologically."""
    cur = conn.execute("""
        SELECT direction, content, timestamp
        FROM text_messages
        WHERE contact_id = ? AND is_group_message = 0
          AND direction = 'sent'
          AND content IS NOT NULL AND content != ''
        ORDER BY timestamp ASC
    """, (contact_id,))

    return [
        {"direction": row[0], "content": row[1], "timestamp": row[2]}
        for row in cur.fetchall()
    ]


def get_sent_messages_for_archetype(
    conn: sqlite3.Connection,
    contact_ids: list[str],
) -> list[dict]:
    """Pull all SENT 1:1 messages across multiple contacts, with name attribution."""
    if not contact_ids:
        return []

    placeholders = ",".join("?" for _ in contact_ids)
    cur = conn.execute(f"""
        SELECT tm.direction, tm.content, tm.timestamp, c.name
        FROM text_messages tm
        JOIN contacts c ON c.id = tm.contact_id
        WHERE tm.contact_id IN ({placeholders})
          AND tm.is_group_message = 0
          AND tm.direction = 'sent'
          AND tm.content IS NOT NULL AND tm.content != ''
        ORDER BY tm.timestamp ASC
    """, contact_ids)

    return [
        {"direction": row[0], "content": row[1], "timestamp": row[2], "contact_name": row[3]}
        for row in cur.fetchall()
    ]


def get_all_sent_messages(conn: sqlite3.Connection) -> list[dict]:
    """Pull ALL sent 1:1 messages (for fallback profile), with name attribution."""
    cur = conn.execute("""
        SELECT tm.direction, tm.content, tm.timestamp, c.name
        FROM text_messages tm
        JOIN contacts c ON c.id = tm.contact_id
        WHERE tm.is_group_message = 0
          AND tm.direction = 'sent'
          AND tm.contact_id NOT IN ({excludes})
          AND tm.content IS NOT NULL AND tm.content != ''
        ORDER BY tm.timestamp ASC
    """.format(excludes=",".join(f"'{cid}'" for cid in VOICE_EXCLUDE_CONTACT_IDS)))

    return [
        {"direction": row[0], "content": row[1], "timestamp": row[2], "contact_name": row[3]}
        for row in cur.fetchall()
    ]


def build_archetype_groups(conn: sqlite3.Connection) -> dict[str, list[str]]:
    """Classify contacts into archetypes for voice profiling.

    Returns dict: {archetype_name: [contact_id, ...]}
    Archetypes: senate_hill, golf, friend_close, friend_regular, professional, new_acquaintance
    """
    cur = conn.execute("""
        SELECT c.id, c.contact_type, c.personal_ring, c.personal_group, c.categories,
               cs.messages_sent
        FROM contacts c
        JOIN text_contact_comm_stats cs ON cs.contact_id = c.id
        WHERE c.id NOT IN ({excludes})
          AND cs.messages_sent > 0
    """.format(excludes=",".join(f"'{cid}'" for cid in VOICE_EXCLUDE_CONTACT_IDS)))

    groups: dict[str, list[str]] = {
        "senate_hill": [],
        "golf": [],
        "friend_close": [],
        "friend_regular": [],
        "professional": [],
        "new_acquaintance": [],
    }

    for row in cur.fetchall():
        cid, contact_type, ring, personal_group, categories_json, sent_count = row
        categories = _parse_json(categories_json, [])
        personal_group = (personal_group or "").lower()

        # Priority order: senate_hill > golf > friend_close > friend_regular > professional > new_acquaintance
        if "senate" in personal_group or "hill" in personal_group or \
           any("senate" in c.lower() or "hill" in c.lower() for c in categories):
            groups["senate_hill"].append(cid)
        elif any("golf" in c.lower() for c in categories):
            groups["golf"].append(cid)
        elif contact_type in ("personal", "both") and ring == "close":
            groups["friend_close"].append(cid)
        elif contact_type in ("personal", "both") and ring in ("regular", None, ""):
            groups["friend_regular"].append(cid)
        elif contact_type == "professional":
            groups["professional"].append(cid)
        elif ring in ("new", "outer") and (sent_count or 0) < 10:
            groups["new_acquaintance"].append(cid)
        else:
            # Default: classify based on contact_type
            if contact_type in ("personal", "both"):
                groups["friend_regular"].append(cid)
            else:
                groups["professional"].append(cid)

    return groups


def sample_messages(messages: list[dict], target: int, seed: int = 42) -> list[dict]:
    """Deterministic random sample of messages, preserving chronological order."""
    if len(messages) <= target:
        return messages
    rng = random.Random(seed)
    indices = sorted(rng.sample(range(len(messages)), target))
    return [messages[i] for i in indices]


def format_sent_messages_for_voice_prompt(
    messages: list[dict],
    include_contact_name: bool = False,
) -> str:
    """Format sent messages for voice extraction prompt.

    Format: [timestamp] [To: Name] content
    """
    lines = []
    for msg in messages:
        ts = msg["timestamp"][:16] if msg.get("timestamp") else "unknown"
        content = msg["content"]
        if len(content) > 500:
            content = content[:500] + "..."
        if include_contact_name and msg.get("contact_name"):
            lines.append(f"[{ts}] [To: {msg['contact_name']}] {content}")
        else:
            lines.append(f"[{ts}] {content}")
    return "\n".join(lines)


def upsert_voice_profile(
    conn: sqlite3.Connection,
    scope: str,
    data: dict,
    contact_id: str | None = None,
    archetype: str | None = None,
) -> str:
    """Insert or update a TextVoiceProfile row. Returns the profile ID."""
    now = datetime.utcnow().isoformat() + "Z"

    # Find existing profile by scope + contact_id/archetype
    if scope == "per_contact" and contact_id:
        existing = conn.execute(
            "SELECT id FROM text_voice_profiles WHERE scope = ? AND contact_id = ?",
            (scope, contact_id),
        ).fetchone()
    elif scope == "archetype" and archetype:
        existing = conn.execute(
            "SELECT id FROM text_voice_profiles WHERE scope = ? AND archetype = ?",
            (scope, archetype),
        ).fetchone()
    elif scope == "fallback":
        existing = conn.execute(
            "SELECT id FROM text_voice_profiles WHERE scope = 'fallback'",
        ).fetchone()
    else:
        existing = None

    fields = {
        "formality": data.get("formality", "casual"),
        "typical_length": data.get("typicalLength", "short"),
        "humor_level": data.get("humorLevel", "medium"),
        "emoji_usage": data.get("emojiUsage", "moderate"),
        "signature_phrases": json.dumps(data.get("signaturePhrases", [])),
        "opener_patterns": json.dumps(data.get("openerPatterns", [])),
        "sign_off_patterns": json.dumps(data.get("signOffPatterns", [])),
        "style_notes": data.get("styleNotes"),
        "sample_messages": json.dumps(data.get("sampleMessages", [])),
    }

    if existing:
        profile_id = existing[0]
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE text_voice_profiles SET {set_clause}, last_extracted = ? WHERE id = ?",
            [*fields.values(), now, profile_id],
        )
    else:
        profile_id = str(uuid.uuid4())
        columns = ["id", "scope", "contact_id", "archetype", *fields.keys(), "last_extracted"]
        placeholders = ", ".join("?" for _ in columns)
        conn.execute(
            f"INSERT INTO text_voice_profiles ({', '.join(columns)}) VALUES ({placeholders})",
            [profile_id, scope, contact_id, archetype, *fields.values(), now],
        )

    return profile_id
