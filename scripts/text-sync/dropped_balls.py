"""Detect dropped balls — unreturned 1:1 messages.

A dropped ball is a 1:1 received message with no reply within:
- Close ring: 3 days
- Regular ring: 7 days
- Outer ring / Professional: 14 days

Group messages are excluded entirely.
"""
import sqlite3
from datetime import datetime, timedelta, timezone
from config import (
    NETWORK_DB_PATH,
    DROPPED_BALL_CLOSE,
    DROPPED_BALL_REGULAR,
    DROPPED_BALL_OUTER,
)


def detect_dropped_balls(db_path: str = NETWORK_DB_PATH) -> int:
    """Scan for dropped balls and update CommStats records.

    Returns number of dropped balls found.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    now = datetime.now(timezone.utc)
    dropped_count = 0

    # Get all phone numbers that have comm stats with a linked contact
    cursor.execute("""
        SELECT cs.id, cs.phone_number, cs.contact_id,
               c.personal_ring, c.contact_type
        FROM text_contact_comm_stats cs
        LEFT JOIN contacts c ON cs.contact_id = c.id
        WHERE cs.contact_id IS NOT NULL
    """)

    stats_rows = cursor.fetchall()

    for row in stats_rows:
        phone = row["phone_number"]
        ring = row["personal_ring"]
        contact_type = row["contact_type"]

        # Determine threshold based on ring
        if ring == "close":
            threshold_days = DROPPED_BALL_CLOSE
        elif ring == "regular":
            threshold_days = DROPPED_BALL_REGULAR
        else:
            threshold_days = DROPPED_BALL_OUTER

        threshold_date = (now - timedelta(days=threshold_days)).isoformat()

        # Find the most recent 1:1 message from this contact
        cursor2 = conn.cursor()
        cursor2.execute("""
            SELECT timestamp, direction FROM text_messages
            WHERE phone_number = ?
              AND is_group_message = 0
            ORDER BY timestamp DESC
            LIMIT 1
        """, (phone,))

        last_msg = cursor2.fetchone()
        if not last_msg:
            continue

        # If the last 1:1 message was received (not sent), check if it's overdue
        if last_msg["direction"] == "received":
            msg_time = last_msg["timestamp"]

            # Check if we've sent any 1:1 message after this received one
            cursor2.execute("""
                SELECT COUNT(*) as cnt FROM text_messages
                WHERE phone_number = ?
                  AND is_group_message = 0
                  AND direction = 'sent'
                  AND timestamp > ?
            """, (phone, msg_time))

            replies = cursor2.fetchone()["cnt"]

            if replies == 0 and msg_time < threshold_date:
                # Dropped ball!
                cursor2.execute("""
                    UPDATE text_contact_comm_stats
                    SET dropped_ball = 1,
                        dropped_ball_since = ?
                    WHERE phone_number = ?
                """, (msg_time, phone))
                dropped_count += 1
            else:
                # Clear dropped ball if it was previously set
                cursor2.execute("""
                    UPDATE text_contact_comm_stats
                    SET dropped_ball = 0,
                        dropped_ball_since = NULL
                    WHERE phone_number = ? AND dropped_ball = 1
                """, (phone,))
        else:
            # Last message was sent — no dropped ball
            cursor2.execute("""
                UPDATE text_contact_comm_stats
                SET dropped_ball = 0,
                    dropped_ball_since = NULL
                WHERE phone_number = ? AND dropped_ball = 1
            """, (phone,))

    conn.commit()
    conn.close()
    return dropped_count
