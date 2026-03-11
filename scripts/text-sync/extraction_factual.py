"""Factual extraction pass — Claude Sonnet.

Extracts evidence-based facts from text message history:
interests, activities, life events, location, open threads, etc.
"""
import json
import logging

import anthropic

from config import ANTHROPIC_API_KEY, FACTUAL_MODEL
from extraction_common import format_messages_for_prompt, parse_json_response

log = logging.getLogger("extraction")

SYSTEM_PROMPT = """\
You are analyzing a text message conversation to extract factual, evidence-based information about the contact. The user is Stephen Andrews, a senior government attorney at the CFTC based in Washington, DC.

Messages are labeled:
S: = sent by Stephen
R: = received by the contact

Extract ONLY what is directly evidenced in the messages. For each field, cite specific messages as evidence. If there isn't enough signal, omit the field rather than guessing.

Confidence levels:
- high: explicitly stated ("I live in Arlington", "My birthday is March 5")
- medium: strongly implied ("picking up the kids from school" implies children; mentioning a restaurant "near my place in Clarendon" implies neighborhood)
- low: loosely suggested (a single mention of an activity, could be one-time)

Pay special attention to "open threads" — plans mentioned but never executed, life events acknowledged but never followed up on, commitments made but not delivered. These are valuable for relationship maintenance. Extract up to 5 most recent/relevant.

Output ONLY valid JSON matching this schema:
{
  "interests": [
    {"interest": "string", "confidence": "high|medium|low", "evidence": "brief quote or context"}
  ],
  "activities": [
    {"activity": "string", "frequency": "daily|weekly|monthly|occasional|one_time", "confidence": "high|medium|low"}
  ],
  "lifeEvents": [
    {"description": "string", "date": "YYYY-MM-DD or null", "eventType": "birthday|move|job_change|engagement|wedding|child_birth|graduation|health|loss|milestone|custom"}
  ],
  "locationSignals": {
    "city": {"value": "string or null", "confidence": "high|medium|low"},
    "stateRegion": {"value": "string or null", "confidence": "high|medium|low"},
    "neighborhood": {"value": "string or null", "confidence": "high|medium|low"},
    "workLocation": {"value": "string or null", "confidence": "high|medium|low"}
  },
  "keyPeopleMentioned": [
    {"name": "string", "relationship": "partner|sibling|parent|child|friend|coworker|boss", "context": "string"}
  ],
  "howWeMetSignal": "string or null",
  "typicalTopics": ["string"],
  "availabilityPatterns": "string or null",
  "openThreads": [
    {"description": "string", "type": "unmade_plan|unfollowed_promise|open_question|dropped_topic", "lastMentioned": "YYYY-MM-DD", "initiatedBy": "stephen|them"}
  ]
}

If a field has no relevant data, use null or empty array. Do not fabricate data."""


def extract_factual(
    contact: dict,
    messages: list[dict],
    chunk_info: str | None = None,
) -> dict | None:
    """Run factual extraction on a contact's message history.

    Args:
        contact: dict with name, contact_type, personal_ring
        messages: list of message dicts with direction, content, timestamp
        chunk_info: optional string like "chunk 2 of 4" for chunked contacts

    Returns:
        Parsed extraction dict, or None on failure
    """
    if not messages:
        return None

    formatted = format_messages_for_prompt(messages)
    first_date = messages[0]["timestamp"][:10] if messages[0]["timestamp"] else "unknown"
    last_date = messages[-1]["timestamp"][:10] if messages[-1]["timestamp"] else "unknown"

    user_prompt = f"""Contact: {contact['name']}
Ring: {contact.get('personal_ring') or 'unknown'}
Contact type: {contact.get('contact_type', 'personal')}
Total messages in this batch: {len(messages)}
Date range: {first_date} to {last_date}
"""

    if chunk_info:
        user_prompt += f"\nNote: This is {chunk_info}. Focus on extracting facts from this time period. A merge pass will combine all chunks.\n"

    user_prompt += f"\n--- MESSAGE HISTORY ---\n{formatted}"

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    try:
        response = client.messages.create(
            model=FACTUAL_MODEL,
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw_text = response.content[0].text
        result = parse_json_response(raw_text)

        if not result:
            log.error(f"  Failed to parse JSON from factual extraction for {contact['name']}")
            log.debug(f"  Raw response: {raw_text[:500]}")
            return None

        # Log token usage
        usage = response.usage
        log.info(
            f"  Factual extraction tokens — input: {usage.input_tokens}, output: {usage.output_tokens}"
        )

        return result

    except anthropic.APIError as e:
        log.error(f"  Anthropic API error for {contact['name']}: {e}")
        return None
    except Exception as e:
        log.error(f"  Unexpected error in factual extraction for {contact['name']}: {e}")
        return None
