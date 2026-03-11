"""Post-event text auto-detection for attendance.

After an event date passes, check messages from invited contacts for:
1. Co-presence signals (day of event, ±4 hours): "on my way", "running late", "I'm here"
2. Post-event signals (12-48 hours after): "great seeing you", "had fun", "thanks for coming"

Simple keyword matching — no Claude needed.
Updates SocialEventAttendee status to 'attended' (pre-checked, user confirms via post-event card).
"""
import sqlite3
import re
from datetime import datetime, timedelta, timezone
from config import NETWORK_DB_PATH


# Co-presence signals (day of event)
CO_PRESENCE_PATTERNS = [
    r"\bon my way\b",
    r"\brunning late\b",
    r"\bi'?m here\b",
    r"\bwhere are you\b",
    r"\bjust parked\b",
    r"\bsee you in\b",
    r"\bheading (there|over|out)\b",
    r"\balmost there\b",
    r"\bpulling up\b",
    r"\bout front\b",
    r"\bat the (bar|restaurant|venue)\b",
    r"\bgrabbed a (seat|table|spot)\b",
]

# Post-event signals (day after)
POST_EVENT_PATTERNS = [
    r"\bgreat seeing you\b",
    r"\bhad (a )?(great |good )?fun\b",
    r"\bthanks for (coming|having|hosting)\b",
    r"\bgood times\b",
    r"\bwe should do that again\b",
    r"\blast night was\b",
    r"\bgreat time\b",
    r"\bhad a blast\b",
    r"\bnice (meeting|seeing|hanging)\b",
]


def detect_attendance(db_path: str = NETWORK_DB_PATH) -> list[dict]:
    """Check for text-based attendance signals for recent events.

    Returns list of {event_id, contact_id, signal_type, evidence}
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    now = datetime.now(timezone.utc)
    two_days_ago = (now - timedelta(days=2)).isoformat().split("T")[0]

    # Find events from the last 2 days that have attendees
    cursor.execute("""
        SELECT se.id as event_id, se.date, se.time,
               sea.contact_id, sea.status
        FROM social_events se
        JOIN social_event_attendees sea ON sea.event_id = se.id
        WHERE se.date >= ?
          AND se.date <= ?
          AND sea.status IN ('invited', 'confirmed')
    """, (two_days_ago, now.isoformat().split("T")[0]))

    attendees = cursor.fetchall()
    if not attendees:
        conn.close()
        return []

    detections = []

    for att in attendees:
        event_date = att["date"]
        contact_id = att["contact_id"]

        # Get the contact's phone from comm stats
        cursor2 = conn.cursor()
        cursor2.execute("""
            SELECT phone_number FROM text_contact_comm_stats WHERE contact_id = ?
        """, (contact_id,))
        phone_row = cursor2.fetchone()
        if not phone_row:
            continue

        phone = phone_row["phone_number"]

        # Check for co-presence signals (event day messages)
        cursor2.execute("""
            SELECT content, timestamp, direction FROM text_messages
            WHERE phone_number = ?
              AND timestamp >= ?
              AND timestamp < ?
              AND is_group_message = 0
        """, (phone, event_date + "T00:00:00", event_date + "T23:59:59"))

        for msg in cursor2:
            content_lower = msg["content"].lower()
            for pattern in CO_PRESENCE_PATTERNS:
                if re.search(pattern, content_lower):
                    detections.append({
                        "event_id": att["event_id"],
                        "contact_id": contact_id,
                        "signal_type": "co_presence",
                        "evidence": msg["content"][:100],
                        "direction": msg["direction"],
                    })
                    break

        # Check for post-event signals (day after)
        next_day = (datetime.fromisoformat(event_date) + timedelta(days=1)).strftime("%Y-%m-%d")
        day_after = (datetime.fromisoformat(event_date) + timedelta(days=2)).strftime("%Y-%m-%d")

        cursor2.execute("""
            SELECT content, timestamp, direction FROM text_messages
            WHERE phone_number = ?
              AND timestamp >= ?
              AND timestamp < ?
              AND is_group_message = 0
        """, (phone, next_day + "T00:00:00", day_after + "T23:59:59"))

        for msg in cursor2:
            content_lower = msg["content"].lower()
            for pattern in POST_EVENT_PATTERNS:
                if re.search(pattern, content_lower):
                    detections.append({
                        "event_id": att["event_id"],
                        "contact_id": contact_id,
                        "signal_type": "post_event",
                        "evidence": msg["content"][:100],
                        "direction": msg["direction"],
                    })
                    break

    conn.close()
    return detections


def apply_detections(detections: list[dict], db_path: str = NETWORK_DB_PATH) -> int:
    """Apply attendance detections — mark attendees as 'attended'.

    Returns count of updated records.
    """
    if not detections:
        return 0

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    updated = 0

    # Deduplicate by (event_id, contact_id)
    seen = set()
    unique_detections = []
    for d in detections:
        key = (d["event_id"], d["contact_id"])
        if key not in seen:
            seen.add(key)
            unique_detections.append(d)

    for d in unique_detections:
        cursor.execute("""
            UPDATE social_event_attendees
            SET status = 'attended'
            WHERE event_id = ? AND contact_id = ? AND status IN ('invited', 'confirmed')
        """, (d["event_id"], d["contact_id"]))
        if cursor.rowcount > 0:
            updated += 1

    conn.commit()
    conn.close()
    return updated


def main():
    """Run standalone detection."""
    detections = detect_attendance()
    print(f"[post_event_detect] Found {len(detections)} attendance signals")
    for d in detections:
        print(f"  {d['signal_type']}: contact {d['contact_id'][:8]}... — \"{d['evidence']}\"")

    if detections:
        updated = apply_detections(detections)
        print(f"[post_event_detect] Updated {updated} attendee records")


if __name__ == "__main__":
    main()
