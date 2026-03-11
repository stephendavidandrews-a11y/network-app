#!/usr/bin/env python3
"""Voice profiling orchestrator.

Analyzes Stephen's sent text messages to build voice profiles at three tiers:
1. Archetype profiles — per communication archetype (friend_close, professional, etc.)
2. Fallback profile — global baseline from all sent messages
3. Per-contact profiles — individual profiles for contacts with 50+ sent messages

Excludes Catherine Cole (fiancée — fundamentally different register).
"""
import logging
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

# Add script directory to path
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    NETWORK_DB_PATH,
    VOICE_ARCHETYPE_SAMPLE_SIZE,
    VOICE_COOLDOWN_SECONDS,
    VOICE_FALLBACK_SAMPLE_SIZE,
    VOICE_MIN_SENT_PER_CONTACT,
)
from extraction_common import (
    VOICE_EXCLUDE_CONTACT_IDS,
    build_archetype_groups,
    get_all_sent_messages,
    get_sent_messages_for_archetype,
    get_sent_messages_for_contact,
    sample_messages,
    upsert_voice_profile,
)
from extraction_voice import extract_voice

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            Path(__file__).parent / "voice.log",
            mode="a",
        ),
    ],
)
log = logging.getLogger("extraction")

ARCHETYPE_LABELS = {
    "senate_hill": "people in the Senate/Capitol Hill political world",
    "golf": "his golf buddies and golf-related contacts",
    "friend_close": "his close personal friends",
    "friend_regular": "his regular friends and acquaintances",
    "professional": "his professional contacts and colleagues",
    "new_acquaintance": "new acquaintances and outer-ring contacts",
}


def main() -> None:
    start_time = datetime.utcnow()
    log.info("=" * 60)
    log.info("VOICE PROFILING RUN STARTED")
    log.info("=" * 60)

    conn = sqlite3.connect(NETWORK_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    try:
        # ---------------------------------------------------------------
        # Phase 1: Archetype profiles
        # ---------------------------------------------------------------
        log.info("\n--- Phase 1: Archetype Profiles ---")
        archetype_groups = build_archetype_groups(conn)

        archetype_successes = 0
        archetype_failures = 0

        for archetype, contact_ids in archetype_groups.items():
            if not contact_ids:
                log.info(f"  [{archetype}] No contacts, skipping")
                continue

            log.info(f"\n  [{archetype}] {len(contact_ids)} contacts")

            messages = get_sent_messages_for_archetype(conn, contact_ids)
            log.info(f"  [{archetype}] {len(messages)} total sent messages")

            if len(messages) < 10:
                log.info(f"  [{archetype}] Too few messages (<10), skipping")
                continue

            sampled = sample_messages(messages, VOICE_ARCHETYPE_SAMPLE_SIZE)
            log.info(f"  [{archetype}] Sampled {len(sampled)} messages for extraction")

            label = ARCHETYPE_LABELS.get(archetype, f"contacts in the '{archetype}' group")
            result = extract_voice(
                scope="archetype",
                messages=sampled,
                scope_label=label,
                include_contact_name=True,
            )

            if result:
                profile_id = upsert_voice_profile(
                    conn, scope="archetype", data=result, archetype=archetype
                )
                conn.commit()
                archetype_successes += 1
                log.info(f"  [{archetype}] Stored profile: {profile_id}")
                log.info(f"  [{archetype}] Style: {result.get('styleNotes', '')[:100]}")
            else:
                archetype_failures += 1
                log.error(f"  [{archetype}] Extraction failed")

            time.sleep(VOICE_COOLDOWN_SECONDS)

        log.info(
            f"\nArchetype phase: {archetype_successes} succeeded, "
            f"{archetype_failures} failed"
        )

        # ---------------------------------------------------------------
        # Phase 2: Fallback profile
        # ---------------------------------------------------------------
        log.info("\n--- Phase 2: Fallback Profile ---")

        all_sent = get_all_sent_messages(conn)
        log.info(f"  Total sent 1:1 messages (all contacts): {len(all_sent)}")

        if len(all_sent) >= 10:
            sampled_fallback = sample_messages(all_sent, VOICE_FALLBACK_SAMPLE_SIZE)
            log.info(f"  Sampled {len(sampled_fallback)} messages for fallback")

            result = extract_voice(
                scope="fallback",
                messages=sampled_fallback,
                scope_label="all of his contacts (global baseline)",
                include_contact_name=True,
            )

            if result:
                profile_id = upsert_voice_profile(conn, scope="fallback", data=result)
                conn.commit()
                log.info(f"  Stored fallback profile: {profile_id}")
                log.info(f"  Style: {result.get('styleNotes', '')[:100]}")
            else:
                log.error("  Fallback extraction failed")

            time.sleep(VOICE_COOLDOWN_SECONDS)
        else:
            log.warning("  Too few sent messages for fallback profile")

        # ---------------------------------------------------------------
        # Phase 3: Per-contact profiles
        # ---------------------------------------------------------------
        log.info("\n--- Phase 3: Per-Contact Profiles ---")

        # Find contacts with 50+ sent messages
        cur = conn.execute("""
            SELECT cs.contact_id, c.name, cs.messages_sent
            FROM text_contact_comm_stats cs
            JOIN contacts c ON c.id = cs.contact_id
            WHERE cs.messages_sent >= ?
              AND cs.contact_id IS NOT NULL
            ORDER BY cs.messages_sent DESC
        """, (VOICE_MIN_SENT_PER_CONTACT,))

        eligible_contacts = []
        for row in cur.fetchall():
            if row[0] not in VOICE_EXCLUDE_CONTACT_IDS:
                eligible_contacts.append({
                    "contact_id": row[0],
                    "name": row[1],
                    "messages_sent": row[2],
                })

        log.info(f"  {len(eligible_contacts)} contacts with {VOICE_MIN_SENT_PER_CONTACT}+ sent messages")

        per_contact_successes = 0
        per_contact_failures = 0

        for i, contact in enumerate(eligible_contacts, 1):
            log.info(
                f"\n  [{i}/{len(eligible_contacts)}] {contact['name']} "
                f"({contact['messages_sent']} sent messages)"
            )

            messages = get_sent_messages_for_contact(conn, contact["contact_id"])
            if not messages:
                log.warning(f"  No sent messages found, skipping")
                continue

            log.info(f"  Fetched {len(messages)} sent messages")

            result = extract_voice(
                scope="per_contact",
                messages=messages,
                scope_label=f"his contact {contact['name']}",
                include_contact_name=False,
            )

            if result:
                profile_id = upsert_voice_profile(
                    conn,
                    scope="per_contact",
                    data=result,
                    contact_id=contact["contact_id"],
                )
                conn.commit()
                per_contact_successes += 1
                log.info(f"  Stored per-contact profile: {profile_id}")
                log.info(f"  Style: {result.get('styleNotes', '')[:100]}")
            else:
                per_contact_failures += 1
                log.error(f"  Per-contact extraction failed for {contact['name']}")

            # Rate limit
            if i < len(eligible_contacts):
                time.sleep(VOICE_COOLDOWN_SECONDS)

        log.info(
            f"\nPer-contact phase: {per_contact_successes} succeeded, "
            f"{per_contact_failures} failed"
        )

        # ---------------------------------------------------------------
        # Summary
        # ---------------------------------------------------------------
        elapsed = (datetime.utcnow() - start_time).total_seconds()
        log.info(f"\n{'=' * 60}")
        log.info(
            f"VOICE PROFILING COMPLETE — "
            f"archetypes: {archetype_successes}/{archetype_successes + archetype_failures}, "
            f"fallback: done, "
            f"per-contact: {per_contact_successes}/{per_contact_successes + per_contact_failures}, "
            f"{elapsed:.1f}s elapsed"
        )
        log.info(f"{'=' * 60}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
