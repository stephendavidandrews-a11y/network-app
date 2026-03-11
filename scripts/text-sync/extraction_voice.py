"""Voice extraction pass — Claude Opus.

Analyzes Stephen's SENT text messages to build a voice profile that captures
how he communicates with different people. Profiles are used later to draft
texts in his authentic style.
"""
import logging

import anthropic

from config import ANTHROPIC_API_KEY, VOICE_MODEL
from extraction_common import format_sent_messages_for_voice_prompt, parse_json_response

log = logging.getLogger("extraction")

SYSTEM_PROMPT = """\
You are a linguistic analyst studying how Stephen Andrews texts. Stephen is a senior government attorney at the CFTC based in Washington, DC.

You will receive a collection of text messages SENT BY Stephen to {scope_label}. Your job is to build a voice profile that captures his texting register, style, and patterns when communicating in this context.

Analyze:
- **Formality level**: How formal/casual is he? Does he use proper grammar or casual abbreviations?
- **Typical message length**: Very short (1-3 words), short (a sentence), medium (2-3 sentences), or long (paragraph+)?
- **Humor**: How much humor does he use? What kind (dry, self-deprecating, witty, meme-heavy)?
- **Emoji usage**: Heavy, moderate, rare, or none?
- **Signature phrases**: Recurring phrases, greetings, or expressions unique to his texting voice
- **Opener patterns**: How does he typically start conversations?
- **Sign-off patterns**: How does he typically end conversations or say goodbye?
- **Style notes**: A 2-4 sentence description of his overall texting voice in this context
- **Sample messages**: Pick 5-8 messages that are most representative of his voice (verbatim)

Messages are formatted as:
[timestamp] content
{name_instruction}

## Output Schema
Return ONLY valid JSON:
{{
  "formality": "casual|semi_formal|formal",
  "typicalLength": "very_short|short|medium|long",
  "humorLevel": "high|medium|low|none",
  "emojiUsage": "heavy|moderate|rare|none",
  "signaturePhrases": ["string — recurring phrases he uses"],
  "openerPatterns": ["string — how he starts conversations"],
  "signOffPatterns": ["string — how he ends conversations"],
  "styleNotes": "string — 2-4 sentence description of his texting voice in this context",
  "sampleMessages": ["string — 5-8 representative messages verbatim"]
}}"""


def extract_voice(
    scope: str,
    messages: list[dict],
    scope_label: str,
    include_contact_name: bool = False,
) -> dict | None:
    """Run voice extraction on a set of sent messages.

    Args:
        scope: "per_contact", "archetype", or "fallback"
        messages: list of sent message dicts
        scope_label: human-readable label for the prompt (e.g. "his close friends")
        include_contact_name: whether messages have contact_name attribution

    Returns:
        Parsed voice profile dict, or None on failure
    """
    if not messages:
        return None

    name_instruction = ""
    if include_contact_name:
        name_instruction = "Messages include [To: Name] to show who each message was sent to."

    system = SYSTEM_PROMPT.format(
        scope_label=scope_label,
        name_instruction=name_instruction,
    )

    formatted = format_sent_messages_for_voice_prompt(messages, include_contact_name)
    first_date = messages[0]["timestamp"][:10] if messages[0].get("timestamp") else "unknown"
    last_date = messages[-1]["timestamp"][:10] if messages[-1].get("timestamp") else "unknown"

    user_prompt = f"""Scope: {scope}
Total sent messages: {len(messages)}
Date range: {first_date} to {last_date}

--- SENT MESSAGES ---
{formatted}"""

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    try:
        response = client.messages.create(
            model=VOICE_MODEL,
            max_tokens=2000,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw_text = response.content[0].text
        result = parse_json_response(raw_text)

        if not result:
            log.error(f"  Failed to parse JSON from voice extraction ({scope_label})")
            log.debug(f"  Raw response: {raw_text[:500]}")
            return None

        # Log token usage
        usage = response.usage
        log.info(
            f"  Voice extraction tokens — input: {usage.input_tokens}, output: {usage.output_tokens}"
        )

        return result

    except anthropic.APIError as e:
        log.error(f"  Anthropic API error for voice extraction ({scope_label}): {e}")
        return None
    except Exception as e:
        log.error(f"  Unexpected error in voice extraction ({scope_label}): {e}")
        return None
