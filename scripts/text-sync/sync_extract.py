#!/usr/bin/env python3
"""Weekly factual extraction orchestrator.

Runs Claude Sonnet on text message history for eligible contacts to extract
interests, activities, life events, location signals, and open threads.

Designed to run via launchd every Sunday at 2am.
"""
import logging
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

# Add script directory to path
sys.path.insert(0, str(Path(__file__).parent))

from config import EXTRACTION_COOLDOWN_SECONDS, NETWORK_DB_PATH
from extraction_common import (
    chunk_messages,
    get_eligible_contacts_factual,
    get_messages_for_contact,
    merge_factual_extractions,
    push_interests_activities,
    push_life_events,
    push_location_to_contact,
    upsert_extraction_profile,
)
from extraction_factual import extract_factual

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            Path(__file__).parent / "extract.log",
            mode="a",
        ),
    ],
)
log = logging.getLogger("extraction")


def main() -> None:
    start_time = datetime.utcnow()
    log.info("=" * 60)
    log.info("FACTUAL EXTRACTION RUN STARTED")
    log.info("=" * 60)

    conn = sqlite3.connect(NETWORK_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    try:
        eligible = get_eligible_contacts_factual(conn)
        log.info(f"Found {len(eligible)} contacts eligible for factual extraction")

        if not eligible:
            log.info("No contacts to process. Done.")
            return

        successes = 0
        failures = 0

        for i, contact in enumerate(eligible, 1):
            log.info(
                f"\n[{i}/{len(eligible)}] Processing: {contact['name']} "
                f"({contact['total_messages']} messages)"
            )

            try:
                messages = get_messages_for_contact(conn, contact["contact_id"])
                if not messages:
                    log.warning(f"  No 1:1 messages found, skipping")
                    continue

                log.info(f"  Fetched {len(messages)} 1:1 messages")

                chunks = chunk_messages(messages)
                log.info(f"  Split into {len(chunks)} chunk(s)")

                extractions: list[dict] = []
                for ci, chunk in enumerate(chunks, 1):
                    chunk_info = f"chunk {ci} of {len(chunks)}" if len(chunks) > 1 else None
                    log.info(
                        f"  Extracting chunk {ci}/{len(chunks)} "
                        f"({len(chunk)} messages, {chunk[0]['timestamp'][:10]} to {chunk[-1]['timestamp'][:10]})"
                    )

                    result = extract_factual(contact, chunk, chunk_info=chunk_info)
                    if result:
                        extractions.append(result)
                    else:
                        log.warning(f"  Chunk {ci} extraction failed")

                    # Rate limit between chunks
                    if ci < len(chunks):
                        time.sleep(EXTRACTION_COOLDOWN_SECONDS)

                if not extractions:
                    log.error(f"  All chunks failed for {contact['name']}")
                    failures += 1
                    continue

                # Merge if chunked
                merged = merge_factual_extractions(extractions)

                # Store extraction profile
                profile_id = upsert_extraction_profile(
                    conn, contact["contact_id"], "factual", merged
                )
                log.info(f"  Stored factual profile: {profile_id}")

                # Push location to contact record
                push_location_to_contact(
                    conn, contact["contact_id"], merged.get("locationSignals")
                )

                # Push interests and activities
                push_interests_activities(
                    conn,
                    contact["contact_id"],
                    merged.get("interests"),
                    merged.get("activities"),
                )

                # Push life events
                push_life_events(
                    conn,
                    contact["contact_id"],
                    merged.get("lifeEvents"),
                )

                conn.commit()
                successes += 1

                # Log extraction summary
                n_interests = len(merged.get("interests") or [])
                n_activities = len(merged.get("activities") or [])
                n_events = len(merged.get("lifeEvents") or [])
                n_threads = len(merged.get("openThreads") or [])
                log.info(
                    f"  Results: {n_interests} interests, {n_activities} activities, "
                    f"{n_events} life events, {n_threads} open threads"
                )

            except Exception as e:
                log.error(f"  Error processing {contact['name']}: {e}", exc_info=True)
                failures += 1
                conn.rollback()

            # Rate limit between contacts
            if i < len(eligible):
                time.sleep(EXTRACTION_COOLDOWN_SECONDS)

        elapsed = (datetime.utcnow() - start_time).total_seconds()
        log.info(f"\n{'=' * 60}")
        log.info(
            f"FACTUAL EXTRACTION COMPLETE — "
            f"{successes} succeeded, {failures} failed, "
            f"{elapsed:.1f}s elapsed"
        )
        log.info(f"{'=' * 60}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
