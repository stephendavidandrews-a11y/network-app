"""Configuration for text sync pipeline."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from the network app root
_env_path = Path(__file__).resolve().parent.parent.parent / ".env.local"
load_dotenv(_env_path, override=True)

# Paths
CHAT_DB_PATH = os.path.expanduser("~/Library/Messages/chat.db")
NETWORK_DB_PATH = os.path.expanduser("~/Documents/Website/network/data/network.db")

# AI models
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
FACTUAL_MODEL = "claude-sonnet-4-20250514"
INTERPRETIVE_MODEL = "claude-opus-4-6"

# Chunking
MAX_MESSAGES_PER_CHUNK = 6000
EXTRACTION_COOLDOWN_SECONDS = 5

# Dropped ball thresholds (days)
DROPPED_BALL_CLOSE = 3
DROPPED_BALL_REGULAR = 7
DROPPED_BALL_OUTER = 14

# Message weighting
WEIGHT_1_1_SENT = 1.0
WEIGHT_1_1_RECEIVED = 1.0
WEIGHT_SMALL_GROUP_SENT = 0.7    # ≤5 participants
WEIGHT_SMALL_GROUP_RECEIVED = 0.4
WEIGHT_MEDIUM_GROUP_SENT = 0.4   # 6-15 participants
WEIGHT_MEDIUM_GROUP_RECEIVED = 0.2
WEIGHT_LARGE_GROUP_SENT = 0.2    # 15+ participants
WEIGHT_LARGE_GROUP_RECEIVED = 0.1

# Triage thresholds
TRIAGE_MAIN_QUEUE_MIN_MESSAGES = 20
TRIAGE_WARM_LEADS_MIN_MESSAGES = 3
TRIAGE_WARM_LEADS_MAX_MESSAGES = 19
TRIAGE_WARM_LEADS_LAST_MESSAGE_MONTHS = 12
TRIAGE_WARM_LEADS_FIRST_MESSAGE_MONTHS = 13

# Extraction thresholds
EXTRACTION_NEW_MESSAGE_THRESHOLD = 20
EXTRACTION_CLOSE_RING_DAYS = 30
EXTRACTION_REGULAR_RING_DAYS = 90

# Voice profiling
VOICE_MODEL = "claude-opus-4-6"
VOICE_MIN_SENT_PER_CONTACT = 50   # per-contact profile threshold
VOICE_ARCHETYPE_SAMPLE_SIZE = 800  # messages per archetype
VOICE_FALLBACK_SAMPLE_SIZE = 800   # messages for global fallback
VOICE_COOLDOWN_SECONDS = 5
