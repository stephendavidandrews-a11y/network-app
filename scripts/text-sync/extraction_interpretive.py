"""Interpretive extraction pass — Claude Opus.

Synthesizes personality insights, communication patterns, relationship
dynamics, and pre-outreach briefs from text message history.
"""
import json
import logging

import anthropic

from config import ANTHROPIC_API_KEY, INTERPRETIVE_MODEL
from extraction_common import format_messages_for_prompt, parse_json_response

log = logging.getLogger("extraction")

SYSTEM_PROMPT = """\
You are a relationship intelligence analyst reviewing the text message history between Stephen Andrews and {contact_name}. Stephen is a senior government attorney at the CFTC based in Washington, DC.

You have already received the FACTUAL extraction (interests, activities, locations, etc.) which provides grounded data points. Your job is the INTERPRETIVE layer: personality insights, communication patterns, relationship dynamics, and a pre-outreach brief.

Ground every assessment in patterns across multiple messages, not single data points. Be honest about confidence — if the signal is weak, say so.

Messages are labeled:
S: = sent by Stephen
R: = received by the contact

## Factual Profile (for context):
{factual_json}

## Output Schema
Return ONLY valid JSON:
{{
  "communicationStyle": "string — how they text (verbose/terse, formal/casual, emoji-heavy, etc.)",
  "personalityRead": {{
    "description": "string — 2-3 sentence personality assessment",
    "confidence": "high|medium|low",
    "traits": ["string — 3-5 trait keywords"]
  }},
  "emotionalAvailability": "string — how emotionally open they are via text",
  "humorStyle": "string — dry, self-deprecating, meme-heavy, earnest, etc. or 'minimal'",
  "reliabilitySignal": "string — do they follow through? Do they flake? Evidence from messages.",
  "whatTheyCareAbout": "string — the 2-3 things that clearly matter most to them",
  "howTheySeeYou": "string — based on their messages, how do they regard Stephen (mentor, peer, casual friend, activity buddy, etc.)",
  "relationshipArc": "deepening|stable|cooling — trajectory based on frequency and depth over time",
  "warmthSignal": "low|medium|high — overall warmth level",
  "initiationPattern": "mostly_stephen|mostly_them|balanced — who initiates conversations more",
  "workingStyle": "string or null — only for professional/both contacts",
  "strategicPriorities": "string or null — only for professional/both contacts",
  "whatTheyWantFromYou": "string or null — only for professional/both contacts",
  "summary": "string — 3-5 sentence relationship summary capturing the essence of this connection",
  "preOutreachBrief": "string — 2-3 sentence briefing Stephen should read before reaching out. What to mention, what to avoid, what tone to strike."
}}

For personal contacts, set workingStyle, strategicPriorities, and whatTheyWantFromYou to null."""


def extract_interpretive(
    contact: dict,
    factual_profile: dict,
    messages: list[dict],
) -> dict | None:
    """Run interpretive extraction on a contact's message history.

    Args:
        contact: dict with name, contact_type, personal_ring
        factual_profile: the factual extraction dict for context
        messages: list of message dicts with direction, content, timestamp

    Returns:
        Parsed extraction dict, or None on failure
    """
    if not messages:
        return None

    # Build system prompt with contact name and factual profile
    factual_json = json.dumps(factual_profile, indent=2, default=str)
    system = SYSTEM_PROMPT.format(
        contact_name=contact["name"],
        factual_json=factual_json,
    )

    formatted = format_messages_for_prompt(messages)
    first_date = messages[0]["timestamp"][:10] if messages[0]["timestamp"] else "unknown"
    last_date = messages[-1]["timestamp"][:10] if messages[-1]["timestamp"] else "unknown"

    user_prompt = f"""Contact: {contact['name']}
Ring: {contact.get('personal_ring') or 'unknown'}
Contact type: {contact.get('contact_type', 'personal')}
Total messages: {len(messages)}
Date range: {first_date} to {last_date}

--- MESSAGE HISTORY ---
{formatted}"""

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    try:
        response = client.messages.create(
            model=INTERPRETIVE_MODEL,
            max_tokens=4000,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw_text = response.content[0].text
        result = parse_json_response(raw_text)

        if not result:
            log.error(f"  Failed to parse JSON from interpretive extraction for {contact['name']}")
            log.debug(f"  Raw response: {raw_text[:500]}")
            return None

        # Null out professional fields for personal contacts
        if contact.get("contact_type") == "personal":
            result["workingStyle"] = None
            result["strategicPriorities"] = None
            result["whatTheyWantFromYou"] = None

        # Log token usage
        usage = response.usage
        log.info(
            f"  Interpretive extraction tokens — input: {usage.input_tokens}, output: {usage.output_tokens}"
        )

        return result

    except anthropic.APIError as e:
        log.error(f"  Anthropic API error for {contact['name']}: {e}")
        return None
    except Exception as e:
        log.error(f"  Unexpected error in interpretive extraction for {contact['name']}: {e}")
        return None
