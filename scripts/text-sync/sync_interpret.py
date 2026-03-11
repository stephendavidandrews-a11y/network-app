#!/usr/bin/env python3
"""Monthly interpretive extraction orchestrator.

Runs Claude Opus on text message history for contacts that have factual
profiles but stale/missing interpretive profiles. Extracts personality,
communication style, relationship dynamics, and pre-outreach briefs.

Designed to run via launchd on the 1st of each month at 2am.
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
    get_eligible_contacts_interpretive,
    get_factual_profile,
    get_messages_for_contact,
    upsert_extraction_profile,
)
from extraction_interpretive import extract_interpretive

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            Path(__file__).parent / "interpret.log",
            mode="a",
        ),
    ],
)
log = logging.getLogger("extraction")


def main() -> None:
    start_time = datetime.utcnow()
    log.info("=" * 60)
    log.info("INTERPRETIVE EXTRACTION RUN STARTED")
    log.info("=" * 60)

    conn = sqlite3.connect(NETWORK_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    try:
        eligible = get_eligible_contacts_interpretive(conn)
        log.info(f"Found {len(eligible)} contacts eligible for interpretive extraction")

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
                # Load factual profile for context
                factual = get_factual_profile(conn, contact["contact_id"])
                if not factual:
                    log.warning(f"  No factual profile found, skipping")
                    continue

                messages = get_messages_for_contact(conn, contact["contact_id"])
                if not messages:
                    log.warning(f"  No 1:1 messages found, skipping")
                    continue

                log.info(f"  Fetched {len(messages)} 1:1 messages")

                # For interpretive, use all messages (no chunking needed —
                # interpretive benefits from full context, and we use Opus
                # which has 200k context). If truly huge, truncate to most
                # recent 6000 messages for the interpretive read.
                if len(messages) > 6000:
                    log.info(f"  Truncating to most recent 6000 messages for interpretive")
                    messages = messages[-6000:]

                result = extract_interpretive(contact, factual, messages)
                if not result:
                    log.error(f"  Interpretive extraction failed for {contact['name']}")
                    failures += 1
                    continue

                # Store extraction profile
                profile_id = upsert_extraction_profile(
                    conn, contact["contact_id"], "interpretive", result
                )
                log.info(f"  Stored interpretive profile: {profile_id}")

                conn.commit()
                successes += 1

                # Log extraction summary
                arc = result.get("relationshipArc", "unknown")
                warmth = result.get("warmthSignal", "unknown")
                log.info(f"  Results: arc={arc}, warmth={warmth}")
                if result.get("summary"):
                    log.info(f"  Summary: {result['summary'][:100]}...")

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
            f"INTERPRETIVE EXTRACTION COMPLETE — "
            f"{successes} succeeded, {failures} failed, "
            f"{elapsed:.1f}s elapsed"
        )
        log.info(f"{'=' * 60}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
