#!/usr/bin/env python3
"""Daily text sync orchestrator.

Reads new messages from chat.db, matches to contacts, computes stats,
detects dropped balls. Designed to run via launchd at 3am daily.

Steps:
1. Read TextSyncMetadata for last ROWID watermark
2. Open chat.db read-only
3. Read messages with ROWID > watermark
4. Import Apple Contacts for phone→name resolution
5. Match phone numbers to network app contacts (four-bucket system)
6. Write new TextMessages to database
7. Recompute TextContactCommStats for affected contacts
8. Update dropped ball flags
9. Update TextSyncMetadata
"""
import json
import logging
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add script directory to path
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    CHAT_DB_PATH,
    NETWORK_DB_PATH,
    WEIGHT_1_1_SENT,
    WEIGHT_1_1_RECEIVED,
    WEIGHT_SMALL_GROUP_SENT,
    WEIGHT_SMALL_GROUP_RECEIVED,
    WEIGHT_MEDIUM_GROUP_SENT,
    WEIGHT_MEDIUM_GROUP_RECEIVED,
    WEIGHT_LARGE_GROUP_SENT,
    WEIGHT_LARGE_GROUP_RECEIVED,
)
from read_chatdb import open_chatdb, read_messages_since, get_group_chat_info, get_max_rowid
from import_contacts import fetch_apple_contacts, build_phone_lookup
from contact_matcher import get_network_contacts, build_network_phone_lookup, classify_phone_numbers
from compute_stats import compute_all_stats
from dropped_balls import detect_dropped_balls
from post_event_detect import detect_attendance, apply_detections

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            Path(__file__).parent / "sync.log",
            mode="a",
        ),
    ],
)
log = logging.getLogger("text_sync")


def get_sync_metadata(conn: sqlite3.Connection) -> dict:
    """Get or create sync metadata record."""
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM text_sync_metadata LIMIT 1")
    row = cursor.fetchone()

    if row:
        return dict(row)

    # Create initial record
    meta_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO text_sync_metadata (id, last_message_row_id, last_run_status, messages_processed, errors)
        VALUES (?, 0, 'never_run', 0, '[]')
    """, (meta_id,))
    conn.commit()

    cursor.execute("SELECT * FROM text_sync_metadata WHERE id = ?", (meta_id,))
    return dict(cursor.fetchone())


def compute_weight(direction: str, is_group: bool, group_size: int | None) -> float:
    """Compute message weight based on type and group size."""
    if not is_group:
        return WEIGHT_1_1_SENT if direction == "sent" else WEIGHT_1_1_RECEIVED

    size = group_size or 2

    if size <= 5:
        return WEIGHT_SMALL_GROUP_SENT if direction == "sent" else WEIGHT_SMALL_GROUP_RECEIVED
    elif size <= 15:
        return WEIGHT_MEDIUM_GROUP_SENT if direction == "sent" else WEIGHT_MEDIUM_GROUP_RECEIVED
    else:
        return WEIGHT_LARGE_GROUP_SENT if direction == "sent" else WEIGHT_LARGE_GROUP_RECEIVED


def ensure_group_chat(
    conn: sqlite3.Connection,
    identifier: str,
    group_info: dict[str, dict],
) -> tuple[str, int]:
    """Get or create a TextGroupChat record. Returns (group_chat_id, participant_count)."""
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, participant_count FROM text_group_chats WHERE chat_db_identifier = ?",
        (identifier,)
    )
    existing = cursor.fetchone()
    if existing:
        return existing["id"], existing["participant_count"]

    info = group_info.get(identifier, {})
    gc_id = str(uuid.uuid4())
    participants = info.get("participant_phones", [])
    count = info.get("participant_count", len(participants) + 1)

    cursor.execute("""
        INSERT INTO text_group_chats (id, chat_db_identifier, name, participant_count, participants)
        VALUES (?, ?, ?, ?, ?)
    """, (
        gc_id,
        identifier,
        info.get("name"),
        count,
        json.dumps(participants),
    ))

    return gc_id, count


def ingest_messages(
    network_db: sqlite3.Connection,
    messages: list[dict],
    network_lookup: dict[str, dict],
    group_info: dict[str, dict],
) -> int:
    """Write messages to text_messages table. Returns count of inserted messages."""
    cursor = network_db.cursor()
    inserted = 0
    errors = []

    for msg in messages:
        try:
            # Check for duplicate (same chat_db_row_id)
            cursor.execute(
                "SELECT id FROM text_messages WHERE chat_db_row_id = ?",
                (msg["row_id"],)
            )
            if cursor.fetchone():
                continue

            phone = msg["phone_number"]
            is_group = msg["is_group"]
            group_chat_id = None
            group_size = None

            # Resolve group chat
            if is_group and msg["group_chat_identifier"]:
                group_chat_id, group_size = ensure_group_chat(
                    network_db, msg["group_chat_identifier"], group_info
                )

            # Resolve contact
            contact_id = None
            net_contact = network_lookup.get(phone)
            if net_contact:
                contact_id = net_contact["id"]

            # Compute weight
            weight = compute_weight(msg["direction"], is_group, group_size)

            msg_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO text_messages (
                    id, contact_id, phone_number, direction, content,
                    timestamp, is_group_message, group_chat_id, group_size,
                    weight, chat_db_row_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                msg_id, contact_id, phone, msg["direction"], msg["content"],
                msg["timestamp"], is_group, group_chat_id, group_size,
                weight, msg["row_id"],
            ))
            inserted += 1

        except Exception as e:
            errors.append(f"Row {msg['row_id']}: {str(e)}")
            log.warning(f"Error ingesting message row {msg['row_id']}: {e}")

    if errors:
        log.warning(f"{len(errors)} errors during ingestion")

    return inserted


def update_sync_metadata(
    conn: sqlite3.Connection,
    meta_id: str,
    new_watermark: int,
    messages_processed: int,
    status: str,
    errors: list[str],
):
    """Update sync metadata after a run."""
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE text_sync_metadata SET
            last_successful_run = CASE WHEN ? IN ('success', 'partial') THEN ? ELSE last_successful_run END,
            last_message_row_id = ?,
            last_run_status = ?,
            messages_processed = messages_processed + ?,
            errors = ?,
            updated_at = ?
        WHERE id = ?
    """, (
        status, now,
        new_watermark,
        status,
        messages_processed,
        json.dumps(errors[-50:]),  # Keep last 50 errors
        now,
        meta_id,
    ))


def link_contact_ids(conn: sqlite3.Connection, network_lookup: dict[str, dict]):
    """Link contactId on CommStats records for matched phone numbers."""
    cursor = conn.cursor()
    for phone, contact in network_lookup.items():
        cursor.execute("""
            UPDATE text_contact_comm_stats
            SET contact_id = ?
            WHERE phone_number = ? AND (contact_id IS NULL OR contact_id != ?)
        """, (contact["id"], phone, contact["id"]))

        # Also update TextMessages
        cursor.execute("""
            UPDATE text_messages
            SET contact_id = ?
            WHERE phone_number = ? AND contact_id IS NULL
        """, (contact["id"], phone))


def run_sync():
    """Main sync entry point."""
    log.info("=== Starting daily text sync ===")
    errors = []

    # Step 1: Open network DB and get metadata
    network_db = sqlite3.connect(NETWORK_DB_PATH)
    network_db.row_factory = sqlite3.Row
    meta = get_sync_metadata(network_db)
    watermark = meta["last_message_row_id"]
    meta_id = meta["id"]
    log.info(f"Last watermark: {watermark}")

    # Step 2: Open chat.db
    try:
        chat_db = open_chatdb()
    except Exception as e:
        log.error(f"Cannot open chat.db: {e}")
        update_sync_metadata(network_db, meta_id, watermark, 0, "failed", [str(e)])
        network_db.commit()
        network_db.close()
        return

    # Step 3: Read new messages
    try:
        messages = read_messages_since(chat_db, watermark)
        max_rowid = get_max_rowid(chat_db)
        group_info = get_group_chat_info(chat_db)
        log.info(f"Read {len(messages)} new messages (max ROWID: {max_rowid})")
    except Exception as e:
        log.error(f"Error reading chat.db: {e}")
        errors.append(f"chat.db read error: {e}")
        update_sync_metadata(network_db, meta_id, watermark, 0, "failed", errors)
        network_db.commit()
        network_db.close()
        chat_db.close()
        return
    finally:
        chat_db.close()

    if not messages:
        log.info("No new messages to process")
        update_sync_metadata(network_db, meta_id, max_rowid, 0, "success", [])
        network_db.commit()
        network_db.close()
        return

    # Step 4: Import Apple Contacts
    log.info("Importing Apple Contacts...")
    apple_contacts = fetch_apple_contacts()
    apple_lookup = build_phone_lookup(apple_contacts)
    log.info(f"Apple Contacts: {len(apple_contacts)} contacts, {len(apple_lookup)} phones")

    # Step 5: Match to network contacts
    network_contacts = get_network_contacts()
    network_lookup = build_network_phone_lookup(network_contacts)
    log.info(f"Network contacts with phones: {len(network_lookup)}")

    # Classify all phone numbers from messages
    message_phones = set(m["phone_number"] for m in messages)
    buckets = classify_phone_numbers(message_phones, network_lookup, apple_lookup)
    log.info(
        f"Buckets: {len(buckets['bucket_1'])} matched, "
        f"{len(buckets['bucket_2'])} triage, "
        f"{len(buckets['bucket_4'])} unknown"
    )

    # Step 6: Ingest messages
    log.info("Ingesting messages...")
    inserted = ingest_messages(network_db, messages, network_lookup, group_info)
    log.info(f"Inserted {inserted} messages")

    # Commit message ingestion before stats
    network_db.commit()

    # Step 7: Compute stats (must run before linking so records exist)
    log.info("Computing comm stats...")
    stats_count = compute_all_stats(apple_lookup=apple_lookup)
    log.info(f"Computed stats for {stats_count} phone numbers")

    # Step 8: Link contact IDs on CommStats + messages
    log.info("Linking contact IDs...")
    link_contact_ids(network_db, network_lookup)
    network_db.commit()

    # Step 9: Import birthdays from Apple Contacts
    log.info("Importing birthdays from Apple Contacts...")
    from import_birthdays import import_birthdays
    birthday_count = import_birthdays(apple_contacts, network_lookup)
    log.info(f"Imported/updated {birthday_count} birthdays")

    # Step 10: Detect dropped balls
    log.info("Detecting dropped balls...")
    dropped = detect_dropped_balls()
    log.info(f"Found {dropped} dropped balls")

    # Step 11: Update reciprocity patterns
    log.info("Updating reciprocity patterns...")
    from compute_stats import update_reciprocity_patterns
    reciprocity_updated = update_reciprocity_patterns()
    log.info(f"Updated {reciprocity_updated} reciprocity patterns")

    # Step 12: Post-event attendance detection
    log.info("Checking post-event attendance signals...")
    detections = detect_attendance()
    attendance_updated = apply_detections(detections)
    log.info(f"Post-event: {len(detections)} signals, {attendance_updated} attendees updated")

    # Step 13: Populate group chat members
    log.info("Populating group chat members...")
    from populate_group_members import populate_group_chat_members
    member_count = populate_group_chat_members()
    log.info(f"Populated {member_count} group chat member records")

    # Step 14: Update metadata
    status = "partial" if errors else "success"
    update_sync_metadata(network_db, meta_id, max_rowid, inserted, status, errors)
    network_db.commit()
    network_db.close()

    log.info(f"=== Sync complete: {inserted} messages, {stats_count} stats, {dropped} dropped balls, {attendance_updated} attendance ===")


if __name__ == "__main__":
    run_sync()
