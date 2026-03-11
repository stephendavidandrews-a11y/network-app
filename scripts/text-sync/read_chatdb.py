"""Read iMessage chat.db and extract messages with phone numbers.

Requires Full Disk Access for the calling process.
Uses watermark tracking to only read new messages since last sync.

chat.db schema (macOS Sequoia):
- message: ROWID, text, attributedBody (BLOB), date (Core Data timestamp),
           is_from_me, handle_id, cache_roomnames
- handle: ROWID, id (phone/email), service
- chat: ROWID, chat_identifier, display_name, group_id
- chat_handle_join: chat_id, handle_id
- chat_message_join: chat_id, message_id

Note: On macOS Ventura+ the `text` column is typically NULL.
Message content is stored in `attributedBody` as a typedstream blob.
"""
import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from config import CHAT_DB_PATH
from phone_utils import normalize_phone


# Apple's Core Data epoch offset (2001-01-01 00:00:00 UTC)
APPLE_EPOCH_OFFSET = 978307200


def apple_timestamp_to_iso(ts: int | None) -> str | None:
    """Convert Apple Core Data nanosecond timestamp to ISO datetime string."""
    if ts is None or ts == 0:
        return None
    # chat.db timestamps are in nanoseconds since 2001-01-01
    seconds = ts / 1_000_000_000
    unix_ts = seconds + APPLE_EPOCH_OFFSET
    try:
        dt = datetime.fromtimestamp(unix_ts, tz=timezone.utc)
        return dt.isoformat()
    except (ValueError, OSError, OverflowError):
        return None


def extract_text_from_attributed_body(blob: bytes) -> str | None:
    """Extract plain text from attributedBody typedstream blob.

    macOS Sequoia stores iMessage text in the attributedBody column as a
    serialized NSAttributedString (typedstream format). The raw UTF-8 text
    sits after the NSString class marker and a '+' (0x2b) byte, prefixed
    by a variable-length integer.
    """
    if not blob:
        return None
    try:
        idx = blob.find(b"NSString")
        if idx < 0:
            return None

        rest = blob[idx + 8:]
        plus_idx = rest.find(b"\x2b")
        if plus_idx < 0 or plus_idx > 10:
            return None

        pos = plus_idx + 1
        length_byte = rest[pos]

        if length_byte == 0x81:
            text_len = int.from_bytes(rest[pos + 1 : pos + 3], "little")
            text_start = pos + 3
        elif length_byte == 0x82:
            text_len = int.from_bytes(rest[pos + 1 : pos + 4], "little")
            text_start = pos + 4
        elif length_byte == 0x83:
            text_len = int.from_bytes(rest[pos + 1 : pos + 5], "little")
            text_start = pos + 5
        else:
            text_len = length_byte
            text_start = pos + 1

        if text_len <= 0 or text_start + text_len > len(rest):
            return None

        text = rest[text_start : text_start + text_len].decode("utf-8", errors="replace")
        return text.strip() if text else None
    except Exception:
        return None


def open_chatdb(path: str = CHAT_DB_PATH) -> sqlite3.Connection:
    """Open chat.db in read-only mode with WAL safety."""
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.execute("PRAGMA query_only = ON")
    conn.row_factory = sqlite3.Row
    return conn


def get_group_chat_info(conn: sqlite3.Connection) -> dict[str, dict]:
    """Build a lookup of chat_identifier → group chat metadata.

    Returns dict: {chat_identifier: {name, participant_count, participant_phones}}
    """
    cursor = conn.cursor()

    # Get all group chats (chat_identifier starts with "chat" for group chats)
    cursor.execute("""
        SELECT
            c.ROWID,
            c.chat_identifier,
            c.display_name,
            c.group_id
        FROM chat c
        WHERE c.chat_identifier LIKE 'chat%'
           OR c.style = 43
    """)

    chats = {}
    for row in cursor:
        chat_id = row["ROWID"]
        identifier = row["chat_identifier"]

        # Get participants for this chat
        cursor2 = conn.cursor()
        cursor2.execute("""
            SELECT h.id
            FROM handle h
            JOIN chat_handle_join chj ON chj.handle_id = h.ROWID
            WHERE chj.chat_id = ?
        """, (chat_id,))

        participants = []
        for h in cursor2:
            normalized = normalize_phone(h["id"])
            if normalized:
                participants.append(normalized)

        chats[identifier] = {
            "name": row["display_name"],
            "participant_count": len(participants) + 1,  # +1 for self
            "participant_phones": participants,
        }

    return chats


def read_messages_since(conn: sqlite3.Connection, since_rowid: int = 0) -> list[dict]:
    """Read all messages with ROWID > since_rowid.

    Returns list of message dicts with resolved phone numbers.
    """
    cursor = conn.cursor()

    # Join via handle table first (works for received msgs).
    # For sent msgs handle_id is often 0, so fall back to the
    # chat → chat_handle_join → handle path.  GROUP BY deduplicates
    # rows created by multiple chat memberships.
    cursor.execute("""
        SELECT
            m.ROWID as row_id,
            m.text,
            m.attributedBody,
            m.date as timestamp,
            m.is_from_me,
            m.cache_roomnames,
            COALESCE(h.id, ch.id) as handle_id,
            COALESCE(h.service, ch.service, 'iMessage') as service
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        LEFT JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
        LEFT JOIN handle ch ON chj.handle_id = ch.ROWID
        WHERE m.ROWID > ?
          AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
          AND m.associated_message_type = 0
        GROUP BY m.ROWID
        ORDER BY m.ROWID ASC
    """, (since_rowid,))

    messages = []
    for row in cursor:
        handle_id = row["handle_id"]
        if not handle_id:
            continue

        # Only process iMessage and SMS (skip email handles)
        if "@" in handle_id and row["service"] != "iMessage":
            continue

        phone = normalize_phone(handle_id)
        # Keep email iMessage handles as-is if phone normalization fails
        if not phone and "@" not in handle_id:
            continue

        iso_ts = apple_timestamp_to_iso(row["timestamp"])
        if not iso_ts:
            continue

        # Extract text: prefer `text` column, fall back to attributedBody blob
        content = row["text"]
        if not content and row["attributedBody"]:
            content = extract_text_from_attributed_body(row["attributedBody"])
        if not content:
            continue

        is_group = bool(row["cache_roomnames"])
        direction = "sent" if row["is_from_me"] else "received"

        messages.append({
            "row_id": row["row_id"],
            "phone_number": phone or handle_id,
            "direction": direction,
            "content": content,
            "timestamp": iso_ts,
            "is_group": is_group,
            "group_chat_identifier": row["cache_roomnames"] if is_group else None,
        })

    return messages


def get_max_rowid(conn: sqlite3.Connection) -> int:
    """Get the current maximum ROWID in the message table."""
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(ROWID) FROM message")
    result = cursor.fetchone()
    return result[0] if result and result[0] else 0


def main():
    """Test read — prints stats about chat.db."""
    try:
        conn = open_chatdb()
    except sqlite3.OperationalError as e:
        print(f"[read_chatdb] Cannot open chat.db: {e}", file=sys.stderr)
        print("[read_chatdb] Ensure Full Disk Access is granted.", file=sys.stderr)
        sys.exit(1)

    max_rowid = get_max_rowid(conn)
    print(f"[read_chatdb] Max ROWID: {max_rowid}")

    # Count total messages (text or attributedBody)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM message WHERE (text IS NOT NULL OR attributedBody IS NOT NULL) AND associated_message_type = 0")
    total = cursor.fetchone()[0]
    print(f"[read_chatdb] Total text messages: {total}")

    # Count handles
    cursor.execute("SELECT COUNT(*) FROM handle")
    handles = cursor.fetchone()[0]
    print(f"[read_chatdb] Total handles: {handles}")

    # Count group chats
    group_chats = get_group_chat_info(conn)
    print(f"[read_chatdb] Group chats: {len(group_chats)}")

    # Sample recent messages
    messages = read_messages_since(conn, max_rowid - 20)
    print(f"\n[read_chatdb] Last {len(messages)} messages:")
    for m in messages[-5:]:
        direction = "→" if m["direction"] == "sent" else "←"
        group = " [group]" if m["is_group"] else ""
        content_preview = m["content"][:60] + "..." if len(m["content"]) > 60 else m["content"]
        print(f"  {direction} {m['phone_number']}{group}: {content_preview}")

    conn.close()


if __name__ == "__main__":
    main()
