"""Populate text_group_chat_members junction table.

Reads text_group_chats.participants JSON arrays, resolves contact_ids
from text_contact_comm_stats, and computes message counts and
participation rates from text_messages.
"""
import json
import logging
import sqlite3
import uuid

from config import NETWORK_DB_PATH

log = logging.getLogger("text_sync")


def populate_group_chat_members(db_path: str = NETWORK_DB_PATH) -> int:
    """Populate text_group_chat_members from text_group_chats.participants.

    Returns count of member records created.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Build phone → contact_id lookup from comm stats
    phone_to_contact = {}
    for row in conn.execute(
        "SELECT phone_number, contact_id FROM text_contact_comm_stats WHERE contact_id IS NOT NULL"
    ):
        phone_to_contact[row["phone_number"]] = row["contact_id"]

    # Get message counts per (phone, group_chat_id) from text_messages
    msg_counts: dict[tuple[str, str], int] = {}
    group_totals: dict[str, int] = {}
    for row in conn.execute("""
        SELECT phone_number, group_chat_id, COUNT(*) as cnt
        FROM text_messages
        WHERE is_group_message = 1 AND group_chat_id IS NOT NULL
        GROUP BY phone_number, group_chat_id
    """):
        key = (row["phone_number"], row["group_chat_id"])
        msg_counts[key] = row["cnt"]
        group_totals[row["group_chat_id"]] = group_totals.get(row["group_chat_id"], 0) + row["cnt"]

    # Read all group chats
    groups = conn.execute("SELECT id, participants FROM text_group_chats").fetchall()

    # Clear existing members for a clean rebuild
    conn.execute("DELETE FROM text_group_chat_members")

    inserted = 0
    for gc in groups:
        gc_id = gc["id"]
        try:
            participants = json.loads(gc["participants"]) if gc["participants"] else []
        except (json.JSONDecodeError, TypeError):
            continue

        if not participants:
            continue

        total_msgs = group_totals.get(gc_id, 0)

        for phone in participants:
            if not phone or not isinstance(phone, str):
                continue

            contact_id = phone_to_contact.get(phone)
            count = msg_counts.get((phone, gc_id), 0)
            rate = count / total_msgs if total_msgs > 0 else 0

            conn.execute("""
                INSERT INTO text_group_chat_members
                    (id, group_chat_id, phone_number, contact_id, message_count, participation_rate)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                str(uuid.uuid4()),
                gc_id,
                phone,
                contact_id,
                count,
                round(rate, 4),
            ))
            inserted += 1

    conn.commit()
    conn.close()
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    count = populate_group_chat_members()
    print(f"Populated {count} group chat member records")
