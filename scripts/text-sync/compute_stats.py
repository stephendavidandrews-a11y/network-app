"""Compute TextContactCommStats from ingested TextMessages.

Runs after message ingestion. Computes per-phone-number stats:
- Total/sent/received counts
- Weighted scores (using message weight from group size)
- Reciprocity ratio
- Trend detection (growing/stable/fading)
- 30/90 day windows
- Average messages per week
- Response latency estimation
"""
import sqlite3
import json
from datetime import datetime, timedelta, timezone
from config import NETWORK_DB_PATH, WEIGHT_1_1_SENT, WEIGHT_1_1_RECEIVED


def compute_all_stats(db_path: str = NETWORK_DB_PATH, apple_lookup: dict[str, dict] | None = None):
    """Recompute CommStats for all phone numbers with messages.

    Args:
        db_path: Path to the network database.
        apple_lookup: Optional phone→Apple Contact dict for name resolution.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    ninety_days_ago = (now - timedelta(days=90)).isoformat()

    # Get all unique phone numbers from text_messages
    cursor.execute("""
        SELECT DISTINCT phone_number FROM text_messages
    """)
    phones = [row["phone_number"] for row in cursor]

    stats_computed = 0
    for phone in phones:
        stats = compute_stats_for_phone(conn, phone, now_iso, thirty_days_ago, ninety_days_ago)
        if stats:
            # Attach Apple Contact name if available
            if apple_lookup and phone in apple_lookup:
                stats["apple_contact_name"] = apple_lookup[phone].get("name")
            upsert_comm_stats(conn, phone, stats)
            stats_computed += 1

    conn.commit()
    conn.close()
    return stats_computed


def compute_stats_for_phone(
    conn: sqlite3.Connection,
    phone: str,
    now_iso: str,
    thirty_days_ago: str,
    ninety_days_ago: str,
) -> dict | None:
    """Compute comm stats for a single phone number."""
    cursor = conn.cursor()

    # Basic counts
    cursor.execute("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN direction = 'sent' THEN 1 ELSE 0 END) as sent,
            SUM(CASE WHEN direction = 'received' THEN 1 ELSE 0 END) as received,
            SUM(weight) as weighted_total,
            MIN(timestamp) as first_msg,
            MAX(timestamp) as last_msg
        FROM text_messages
        WHERE phone_number = ?
    """, (phone,))

    row = cursor.fetchone()
    if not row or row["total"] == 0:
        return None

    total = row["total"]
    sent = row["sent"]
    received = row["received"]

    # 30-day and 90-day counts
    cursor.execute("""
        SELECT COUNT(*) as cnt FROM text_messages
        WHERE phone_number = ? AND timestamp >= ?
    """, (phone, thirty_days_ago))
    last_30 = cursor.fetchone()["cnt"]

    cursor.execute("""
        SELECT COUNT(*) as cnt FROM text_messages
        WHERE phone_number = ? AND timestamp >= ?
    """, (phone, ninety_days_ago))
    last_90 = cursor.fetchone()["cnt"]

    # Average messages per week
    first_msg = row["first_msg"]
    last_msg = row["last_msg"]
    if first_msg and last_msg:
        try:
            first_dt = datetime.fromisoformat(first_msg.replace("Z", "+00:00"))
            last_dt = datetime.fromisoformat(last_msg.replace("Z", "+00:00"))
            weeks = max((last_dt - first_dt).days / 7, 1)
            avg_per_week = total / weeks
        except (ValueError, TypeError):
            avg_per_week = 0
    else:
        avg_per_week = 0

    # Reciprocity ratio
    reciprocity = sent / total if total > 0 else 0

    # Trend detection: compare last 30 days to previous 30 days
    sixty_days_ago = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    cursor.execute("""
        SELECT COUNT(*) as cnt FROM text_messages
        WHERE phone_number = ? AND timestamp >= ? AND timestamp < ?
    """, (phone, sixty_days_ago, thirty_days_ago))
    prev_30 = cursor.fetchone()["cnt"]

    if last_30 > prev_30 * 1.5 and last_30 >= 5:
        trend = "growing"
    elif last_30 < prev_30 * 0.5 and prev_30 >= 5:
        trend = "fading"
    else:
        trend = "stable"

    # Response latency (estimate from 1:1 messages only)
    response_latency = compute_response_latency(conn, phone)

    # Group chat participation rate
    cursor.execute("""
        SELECT
            COUNT(CASE WHEN is_group_message = 1 AND direction = 'sent' THEN 1 END) as group_sent,
            COUNT(CASE WHEN is_group_message = 1 THEN 1 END) as group_total
        FROM text_messages
        WHERE phone_number = ?
    """, (phone,))
    group_row = cursor.fetchone()
    group_participation = (
        group_row["group_sent"] / group_row["group_total"]
        if group_row["group_total"] > 0 else 0
    )

    # Get linked contact_id if exists
    cursor.execute("""
        SELECT contact_id FROM text_contact_comm_stats WHERE phone_number = ?
    """, (phone,))
    existing = cursor.fetchone()
    contact_id = existing["contact_id"] if existing else None

    return {
        "contact_id": contact_id,
        "total_weighted_score": row["weighted_total"] or 0,
        "total_messages": total,
        "messages_sent": sent,
        "messages_received": received,
        "first_message_date": first_msg,
        "last_message_date": last_msg,
        "avg_messages_per_week": round(avg_per_week, 2),
        "last_30_day_count": last_30,
        "last_90_day_count": last_90,
        "reciprocity_ratio": round(reciprocity, 3),
        "response_latency_avg": response_latency,
        "trend": trend,
        "participation_rate_group_chats": round(group_participation, 3),
        "last_computed": now_iso,
    }


def compute_response_latency(conn: sqlite3.Connection, phone: str) -> float | None:
    """Estimate average response time for 1:1 messages.

    Looks at received→sent pairs within 24 hours.
    Returns average minutes or None if insufficient data.
    """
    cursor = conn.cursor()

    # Get 1:1 messages ordered by time
    cursor.execute("""
        SELECT direction, timestamp FROM text_messages
        WHERE phone_number = ? AND is_group_message = 0
        ORDER BY timestamp ASC
    """, (phone,))

    messages = cursor.fetchall()
    if len(messages) < 4:
        return None

    latencies = []
    for i in range(len(messages) - 1):
        # Look for received → sent pairs (our response time)
        if messages[i]["direction"] == "received" and messages[i + 1]["direction"] == "sent":
            try:
                t1 = datetime.fromisoformat(messages[i]["timestamp"].replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(messages[i + 1]["timestamp"].replace("Z", "+00:00"))
                delta_minutes = (t2 - t1).total_seconds() / 60
                # Only count responses within 24 hours
                if 0 < delta_minutes < 1440:
                    latencies.append(delta_minutes)
            except (ValueError, TypeError):
                continue

    if len(latencies) < 3:
        return None

    return round(sum(latencies) / len(latencies), 1)


def upsert_comm_stats(conn: sqlite3.Connection, phone: str, stats: dict):
    """Insert or update comm stats for a phone number."""
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM text_contact_comm_stats WHERE phone_number = ?", (phone,))
    existing = cursor.fetchone()

    apple_name = stats.get("apple_contact_name")

    if existing:
        cursor.execute("""
            UPDATE text_contact_comm_stats SET
                contact_id = COALESCE(?, contact_id),
                total_weighted_score = ?,
                total_messages = ?,
                messages_sent = ?,
                messages_received = ?,
                first_message_date = ?,
                last_message_date = ?,
                avg_messages_per_week = ?,
                last_30_day_count = ?,
                last_90_day_count = ?,
                reciprocity_ratio = ?,
                response_latency_avg = ?,
                trend = ?,
                participation_rate_group_chats = ?,
                apple_contact_name = COALESCE(?, apple_contact_name),
                last_computed = ?
            WHERE phone_number = ?
        """, (
            stats["contact_id"],
            stats["total_weighted_score"],
            stats["total_messages"],
            stats["messages_sent"],
            stats["messages_received"],
            stats["first_message_date"],
            stats["last_message_date"],
            stats["avg_messages_per_week"],
            stats["last_30_day_count"],
            stats["last_90_day_count"],
            stats["reciprocity_ratio"],
            stats["response_latency_avg"],
            stats["trend"],
            stats["participation_rate_group_chats"],
            apple_name,
            stats["last_computed"],
            phone,
        ))
    else:
        import uuid
        cursor.execute("""
            INSERT INTO text_contact_comm_stats (
                id, phone_number, contact_id,
                total_weighted_score, total_messages, messages_sent, messages_received,
                first_message_date, last_message_date, avg_messages_per_week,
                last_30_day_count, last_90_day_count, reciprocity_ratio,
                response_latency_avg, trend, participation_rate_group_chats,
                apple_contact_name, last_computed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()), phone, stats["contact_id"],
            stats["total_weighted_score"], stats["total_messages"],
            stats["messages_sent"], stats["messages_received"],
            stats["first_message_date"], stats["last_message_date"],
            stats["avg_messages_per_week"],
            stats["last_30_day_count"], stats["last_90_day_count"],
            stats["reciprocity_ratio"], stats["response_latency_avg"],
            stats["trend"], stats["participation_rate_group_chats"],
            apple_name, stats["last_computed"],
        ))


def update_reciprocity_patterns(db_path: str = NETWORK_DB_PATH) -> int:
    """Auto-populate reciprocityPattern on Contact from CommStats reciprocityRatio.

    Rules:
    - ratio > 0.65 → i_initiate
    - ratio < 0.35 → they_initiate
    - 0.35–0.65 → mutual
    - total_messages < 10 → leave as unknown (insufficient data)
    - Only updates contacts where current value is auto-computable
      (unknown/i_initiate/they_initiate/mutual). Preserves manual values
      like one_sided_me and one_sided_them.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get comm stats joined with contacts (personal/both only)
    cursor.execute("""
        SELECT cs.contact_id, cs.reciprocity_ratio, cs.total_messages,
               c.reciprocity_pattern
        FROM text_contact_comm_stats cs
        JOIN contacts c ON cs.contact_id = c.id
        WHERE cs.contact_id IS NOT NULL
          AND c.contact_type IN ('personal', 'both')
          AND cs.total_messages >= 10
    """)

    auto_values = {'unknown', 'i_initiate', 'they_initiate', 'mutual'}
    updated = 0

    for row in cursor.fetchall():
        current = row["reciprocity_pattern"] or "unknown"
        if current not in auto_values:
            continue  # preserve manual values

        ratio = row["reciprocity_ratio"] or 0.5
        if ratio > 0.65:
            new_pattern = "i_initiate"
        elif ratio < 0.35:
            new_pattern = "they_initiate"
        else:
            new_pattern = "mutual"

        if new_pattern != current:
            conn.execute(
                "UPDATE contacts SET reciprocity_pattern = ? WHERE id = ?",
                (new_pattern, row["contact_id"]),
            )
            updated += 1

    conn.commit()
    conn.close()
    return updated
