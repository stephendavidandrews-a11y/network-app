-- Step F: InteractionParticipant table for multi-person conversation tracking
CREATE TABLE IF NOT EXISTS "interaction_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interaction_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "speaker_label" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "interaction_participants_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "interactions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interaction_participants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "interaction_participants_interaction_id_contact_id_key" ON "interaction_participants"("interaction_id", "contact_id");
CREATE INDEX IF NOT EXISTS "interaction_participants_interaction_id_idx" ON "interaction_participants"("interaction_id");
CREATE INDEX IF NOT EXISTS "interaction_participants_contact_id_idx" ON "interaction_participants"("contact_id");
