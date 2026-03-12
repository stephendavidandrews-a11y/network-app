-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "organization" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "twitter_handle" TEXT,
    "personal_website" TEXT,
    "photo_url" TEXT,
    "tier" INTEGER NOT NULL,
    "categories" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "target_cadence_days" INTEGER NOT NULL DEFAULT 60,
    "last_interaction_date" TEXT,
    "relationship_strength" REAL NOT NULL DEFAULT 0,
    "strategic_value" REAL NOT NULL DEFAULT 0,
    "introduction_pathway" TEXT,
    "connection_to_hawley_orbit" TEXT,
    "why_they_matter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'target',
    "notes" TEXT,
    "contact_type" TEXT NOT NULL DEFAULT 'professional',
    "outreach_mode" TEXT NOT NULL DEFAULT 'direct',
    "accessibility" TEXT NOT NULL DEFAULT 'high',
    "outreach_timing" TEXT,
    "personal_ring" TEXT,
    "personal_cadence_days" INTEGER,
    "funnel_stage" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "discovered_via" TEXT,
    "dossier_current_version" INTEGER
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TEXT NOT NULL DEFAULT (date('now')),
    "summary" TEXT,
    "commitments" TEXT NOT NULL DEFAULT '[]',
    "new_contacts_mentioned" TEXT NOT NULL DEFAULT '[]',
    "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_description" TEXT,
    "follow_up_completed" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_completed_date" TEXT,
    "sentiment" TEXT,
    "relationship_delta" TEXT,
    "relationship_notes" TEXT,
    "topics_discussed" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_ingestion_id" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "interactions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interactions_source_ingestion_id_fkey" FOREIGN KEY ("source_ingestion_id") REFERENCES "ingestion_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "intelligence_signals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_url" TEXT,
    "source_name" TEXT,
    "detected_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "outreach_hook" TEXT,
    "hook_used" BOOLEAN NOT NULL DEFAULT false,
    "relevance_score" REAL NOT NULL DEFAULT 5.0,
    "source_ingestion_id" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "intelligence_signals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "intelligence_signals_source_ingestion_id_fkey" FOREIGN KEY ("source_ingestion_id") REFERENCES "ingestion_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "organizer" TEXT,
    "location" TEXT,
    "date_start" TEXT,
    "date_end" TEXT,
    "event_url" TEXT,
    "event_type" TEXT,
    "topic_relevance_score" REAL NOT NULL DEFAULT 5.0,
    "topics" TEXT NOT NULL DEFAULT '[]',
    "has_speaking_opportunity" BOOLEAN NOT NULL DEFAULT false,
    "cfp_deadline" TEXT,
    "cfp_url" TEXT,
    "cfp_status" TEXT NOT NULL DEFAULT 'not_applicable',
    "abstract_draft" TEXT,
    "contacts_attending" TEXT NOT NULL DEFAULT '[]',
    "contacts_speaking" TEXT NOT NULL DEFAULT '[]',
    "pre_event_outreach_sent" BOOLEAN NOT NULL DEFAULT false,
    "post_event_followup_sent" BOOLEAN NOT NULL DEFAULT false,
    "attending" BOOLEAN NOT NULL DEFAULT false,
    "speaking" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "outreach_queue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "trigger_description" TEXT NOT NULL,
    "signal_id" TEXT,
    "event_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "draft_subject" TEXT,
    "draft_body" TEXT,
    "draft_format" TEXT NOT NULL DEFAULT 'email',
    "ai_model_used" TEXT,
    "context_package" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "original_draft" TEXT,
    "final_text" TEXT,
    "was_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "reviewed_at" TEXT,
    "sent_at" TEXT,
    "deferred_until" TEXT,
    "notes" TEXT,
    CONSTRAINT "outreach_queue_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "outreach_queue_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "intelligence_signals" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "outreach_queue_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_relationships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_a_id" TEXT NOT NULL,
    "contact_b_id" TEXT NOT NULL,
    "relationship_type" TEXT,
    "strength" INTEGER NOT NULL DEFAULT 3,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "observation_source" TEXT,
    "observation_count" INTEGER NOT NULL DEFAULT 1,
    "last_observed" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "contact_relationships_contact_a_id_fkey" FOREIGN KEY ("contact_a_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contact_relationships_contact_b_id_fkey" FOREIGN KEY ("contact_b_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_briefings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL DEFAULT (date('now')),
    "content" TEXT NOT NULL,
    "generated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "meeting_preps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "calendar_event_id" TEXT,
    "meeting_title" TEXT,
    "brief_content" TEXT NOT NULL,
    "generated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "meeting_preps_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "calendar_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "calendar_data" TEXT NOT NULL,
    "meeting_count" INTEGER NOT NULL DEFAULT 0,
    "fetched_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interaction_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" TEXT,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "fulfilled_date" TEXT,
    "fulfilled_notes" TEXT,
    "reminder_snoozed_until" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "direction" TEXT,
    "kind" TEXT,
    "firmness" TEXT,
    CONSTRAINT "commitments_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "interactions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "commitments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "organization_domains" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization" TEXT NOT NULL,
    "domain" TEXT,
    "resolved_by" TEXT NOT NULL DEFAULT 'manual',
    "confidence" TEXT NOT NULL DEFAULT 'high',
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "enrichment_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'hunter',
    "email" TEXT,
    "score" INTEGER,
    "domain" TEXT,
    "raw_response" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "enrichment_results_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ingestion_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "raw_content" TEXT NOT NULL,
    "transcript" TEXT,
    "contact_id" TEXT,
    "contact_hint" TEXT,
    "extraction" TEXT NOT NULL,
    "manifest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sensitivity_flag" BOOLEAN NOT NULL DEFAULT false,
    "content_hash" TEXT,
    "thread_id" TEXT,
    "cluster_id" TEXT,
    "dismiss_reason" TEXT,
    "confidence" REAL,
    "auto_handled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "reviewed_at" TEXT,
    CONSTRAINT "ingestion_items_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "standing_offers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "offered_by" TEXT NOT NULL,
    "original_words" TEXT NOT NULL,
    "source_interaction_id" TEXT,
    "source_ingestion_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source_system" TEXT,
    "source_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "used_at" TEXT,
    CONSTRAINT "standing_offers_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scheduling_leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "original_words" TEXT,
    "timeframe" TEXT,
    "resolved_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "linked_event_id" TEXT,
    "source_ingestion_id" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "scheduling_leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "life_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'custom',
    "person" TEXT NOT NULL,
    "event_date" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "source_ingestion_id" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "life_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "referenced_resources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT,
    "description" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "url" TEXT,
    "action" TEXT NOT NULL DEFAULT 'reference_only',
    "source_ingestion_id" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "referenced_resources_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_dossiers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "source_interaction_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "contact_dossiers_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "learning_signals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingestion_item_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "edit_details" TEXT,
    "dismiss_reason" TEXT,
    "teach_me_response" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "learning_signals_ingestion_item_id_fkey" FOREIGN KEY ("ingestion_item_id") REFERENCES "ingestion_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_pretexts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "pretext_type" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "strength" TEXT NOT NULL DEFAULT 'medium',
    "valid_from" TEXT,
    "valid_until" TEXT,
    "source_id" TEXT,
    "source_type" TEXT,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "contact_pretexts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_provenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "source_contact_id" TEXT,
    "type" TEXT NOT NULL,
    "event_id" TEXT,
    "source_interaction_id" TEXT,
    "source_ingestion_id" TEXT,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    CONSTRAINT "contact_provenance_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contact_provenance_source_contact_id_fkey" FOREIGN KEY ("source_contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "text_contact_comm_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT,
    "phone_number" TEXT NOT NULL,
    "total_weighted_score" REAL NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "messages_received" INTEGER NOT NULL DEFAULT 0,
    "first_message_date" TEXT,
    "last_message_date" TEXT,
    "avg_messages_per_week" REAL NOT NULL DEFAULT 0,
    "last_30_day_count" INTEGER NOT NULL DEFAULT 0,
    "last_90_day_count" INTEGER NOT NULL DEFAULT 0,
    "reciprocity_ratio" REAL NOT NULL DEFAULT 0,
    "response_latency_avg" REAL,
    "trend" TEXT NOT NULL DEFAULT 'stable',
    "participation_rate_group_chats" REAL NOT NULL DEFAULT 0,
    "dropped_ball" BOOLEAN NOT NULL DEFAULT false,
    "dropped_ball_since" TEXT,
    "apple_contact_name" TEXT,
    "triage_status" TEXT,
    "last_computed" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "text_contact_comm_stats_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "friend_relationships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_a_id" TEXT NOT NULL,
    "contact_b_id" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL DEFAULT 'know_each_other',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "friend_relationships_contact_a_id_fkey" FOREIGN KEY ("contact_a_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "friend_relationships_contact_b_id_fkey" FOREIGN KEY ("contact_b_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personal_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'occasional',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "last_mentioned" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "personal_activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personal_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "personal_group_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "personal_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "personal_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "personal_group_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personal_interests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "interest" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "mention_count" INTEGER NOT NULL DEFAULT 0,
    "last_mentioned" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "personal_interests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personal_venues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "venue_type" TEXT NOT NULL DEFAULT 'other',
    "neighborhood" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Washington, DC',
    "price_range" TEXT,
    "good_for" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "last_visited" TEXT,
    "times_visited" INTEGER NOT NULL DEFAULT 0,
    "latitude" REAL,
    "longitude" REAL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "social_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plan_type" TEXT NOT NULL,
    "target_date" TEXT NOT NULL,
    "suggested_contacts" TEXT NOT NULL DEFAULT '[]',
    "suggested_venue_id" TEXT,
    "alternative_venue_ids" TEXT NOT NULL DEFAULT '[]',
    "group_reasoning" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_at" TEXT,
    "completed_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "title" TEXT,
    "time" TEXT,
    "notes" TEXT,
    "public_visibility" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "description" TEXT,
    "co_hosted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "social_plans_suggested_venue_id_fkey" FOREIGN KEY ("suggested_venue_id") REFERENCES "personal_venues" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "social_plan_attendees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plan_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "was_plus_one" BOOLEAN NOT NULL DEFAULT false,
    "invited_by" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "social_plan_attendees_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "social_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "social_plan_attendees_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "text_extraction_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "extraction_type" TEXT NOT NULL,
    "interests" TEXT,
    "activities" TEXT,
    "life_events" TEXT,
    "location_signals" TEXT,
    "key_people_mentioned" TEXT,
    "how_we_met_signal" TEXT,
    "typical_topics" TEXT,
    "availability_patterns" TEXT,
    "open_threads" TEXT,
    "communication_style" TEXT,
    "personality_read" TEXT,
    "emotional_availability" TEXT,
    "humor_style" TEXT,
    "reliability_signal" TEXT,
    "what_they_care_about" TEXT,
    "how_they_see_you" TEXT,
    "relationship_arc" TEXT,
    "warmth_signal" TEXT,
    "initiation_pattern" TEXT,
    "working_style" TEXT,
    "strategic_priorities" TEXT,
    "what_they_want_from_you" TEXT,
    "summary" TEXT,
    "pre_outreach_brief" TEXT,
    "last_extracted" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "text_extraction_profiles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "text_voice_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "contact_id" TEXT,
    "archetype" TEXT,
    "formality" TEXT NOT NULL DEFAULT 'casual',
    "typical_length" TEXT NOT NULL DEFAULT 'short',
    "humor_level" TEXT NOT NULL DEFAULT 'medium',
    "emoji_usage" TEXT NOT NULL DEFAULT 'moderate',
    "signature_phrases" TEXT NOT NULL DEFAULT '[]',
    "opener_patterns" TEXT NOT NULL DEFAULT '[]',
    "sign_off_patterns" TEXT NOT NULL DEFAULT '[]',
    "style_notes" TEXT,
    "sample_messages" TEXT NOT NULL DEFAULT '[]',
    "last_extracted" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "text_voice_profiles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personal_nudges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nudge_type" TEXT NOT NULL,
    "contact_ids" TEXT NOT NULL DEFAULT '[]',
    "reasoning" TEXT,
    "suggested_action" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduled_for" TEXT,
    "completed_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "social_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_type" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT,
    "venue_id" TEXT,
    "venue_name" TEXT,
    "co_hosted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "public_visibility" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "description" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "social_events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "personal_venues" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "social_event_attendees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "was_plus_one" BOOLEAN NOT NULL DEFAULT false,
    "invited_by" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "social_event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "social_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "social_event_attendees_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invite_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "how_know_me" TEXT,
    "event_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "reviewed_at" TEXT,
    CONSTRAINT "invite_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "social_events" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "text_group_chats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chat_db_identifier" TEXT NOT NULL,
    "name" TEXT,
    "participant_count" INTEGER NOT NULL,
    "participants" TEXT NOT NULL DEFAULT '[]',
    "first_message" TEXT,
    "last_message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "text_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT,
    "phone_number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "is_group_message" BOOLEAN NOT NULL DEFAULT false,
    "group_chat_id" TEXT,
    "group_size" INTEGER,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "chat_db_row_id" INTEGER NOT NULL,
    "ingested_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "text_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "text_messages_group_chat_id_fkey" FOREIGN KEY ("group_chat_id") REFERENCES "text_group_chats" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "text_sync_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "last_successful_run" TEXT,
    "last_message_row_id" INTEGER NOT NULL DEFAULT 0,
    "last_run_status" TEXT NOT NULL DEFAULT 'never_run',
    "messages_processed" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT NOT NULL DEFAULT '[]',
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "author_contact_id" TEXT,
    "publication" TEXT,
    "published_at" TEXT,
    "source_url" TEXT,
    "full_text" TEXT,
    "summary" TEXT,
    "ingestion_status" TEXT NOT NULL DEFAULT 'pending',
    "ingested_at" TEXT,
    "word_count" INTEGER,
    "topic_relevance_score" REAL NOT NULL DEFAULT 0,
    "topic_tags" TEXT NOT NULL DEFAULT '[]',
    "article_type" TEXT,
    "core_event" TEXT,
    "why_it_matters" TEXT,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "content_items_author_contact_id_fkey" FOREIGN KEY ("author_contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_extractions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content_item_id" TEXT NOT NULL,
    "extraction_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "raw_quote" TEXT,
    "contact_id" TEXT,
    "second_contact_id" TEXT,
    "event_id" TEXT,
    "discovered_name" TEXT,
    "discovered_title" TEXT,
    "discovered_org" TEXT,
    "discovered_context" TEXT,
    "topic" TEXT,
    "position" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "urgency" TEXT,
    "is_new_position" BOOLEAN NOT NULL DEFAULT false,
    "actionable_by" TEXT,
    "network_status" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_action" TEXT,
    "discovery_source" TEXT,
    "podcast_episode_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "content_extractions_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_extractions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_extractions_second_contact_id_fkey" FOREIGN KEY ("second_contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_extractions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scrape_frequency" TEXT NOT NULL,
    "topic_filters" TEXT NOT NULL DEFAULT '[]',
    "parser_config" TEXT NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_scraped_at" TEXT,
    "last_result_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "discovered_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_id" TEXT NOT NULL,
    "raw_title" TEXT NOT NULL,
    "raw_description" TEXT,
    "raw_date" TEXT,
    "raw_location" TEXT,
    "raw_url" TEXT,
    "raw_speakers" TEXT,
    "scraped_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "status" TEXT NOT NULL DEFAULT 'new',
    "topic_relevance_score" REAL,
    "classification_notes" TEXT,
    "has_cfp" BOOLEAN NOT NULL DEFAULT false,
    "cfp_deadline" TEXT,
    "promoted_event_id" TEXT,
    "dismissed_reason" TEXT,
    CONSTRAINT "discovered_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "event_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "discovered_events_promoted_event_id_fkey" FOREIGN KEY ("promoted_event_id") REFERENCES "events" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "draft_corrections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT,
    "purpose" TEXT NOT NULL,
    "original_draft" TEXT NOT NULL,
    "edited_draft" TEXT NOT NULL,
    "voice_source" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "draft_corrections_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "intel_briefs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "week_start" TEXT NOT NULL,
    "week_end" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_stats" TEXT NOT NULL DEFAULT '{}',
    "generated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "podcasts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT,
    "host_contact_id" TEXT,
    "producer_name" TEXT,
    "producer_contact_id" TEXT,
    "producer_email" TEXT,
    "pitch_email" TEXT,
    "rss_feed_url" TEXT,
    "website_url" TEXT,
    "audience_description" TEXT,
    "audience_size" INTEGER,
    "topic_alignment" REAL NOT NULL DEFAULT 0,
    "tier" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'monitoring',
    "last_episode_monitored_at" TEXT,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "podcasts_host_contact_id_fkey" FOREIGN KEY ("host_contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "podcasts_producer_contact_id_fkey" FOREIGN KEY ("producer_contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "podcast_episodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "podcast_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "published_at" TEXT,
    "description" TEXT,
    "episode_url" TEXT,
    "audio_url" TEXT,
    "duration_minutes" INTEGER,
    "topic_relevance_score" REAL NOT NULL DEFAULT 0,
    "topic_tags" TEXT NOT NULL DEFAULT '[]',
    "is_pitch_window" BOOLEAN NOT NULL DEFAULT false,
    "ingestion_status" TEXT NOT NULL DEFAULT 'pending',
    "transcript_text" TEXT,
    "guest_names" TEXT NOT NULL DEFAULT '[]',
    "guest_extractions" TEXT,
    "pitch_window_expires_at" TEXT,
    "triage_status" TEXT NOT NULL DEFAULT 'new',
    "content_item_id" TEXT,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "podcast_episodes_podcast_id_fkey" FOREIGN KEY ("podcast_id") REFERENCES "podcasts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "podcast_episodes_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "podcast_outreach" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "podcast_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "outreach_type" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "sent_at" TEXT,
    "response_received" BOOLEAN NOT NULL DEFAULT false,
    "response_date" TEXT,
    "response_content" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "podcast_outreach_podcast_id_fkey" FOREIGN KEY ("podcast_id") REFERENCES "podcasts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "podcast_outreach_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "triage_feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discovered_event_id" TEXT NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_category" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "original_score" INTEGER,
    "reason" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "triage_feedback_discovered_event_id_fkey" FOREIGN KEY ("discovered_event_id") REFERENCES "discovered_events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_interests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "interest" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "mention_count" INTEGER NOT NULL DEFAULT 0,
    "last_mentioned" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "contact_interests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_profile_signals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" REAL,
    "conversation_date" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "contact_profile_signals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "org_type" TEXT,
    "website" TEXT,
    "domain" TEXT,
    "description" TEXT,
    "parent_organization_id" TEXT,
    "hq_city" TEXT,
    "hq_state_region" TEXT,
    "hq_country" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "organizations_parent_organization_id_fkey" FOREIGN KEY ("parent_organization_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "organization_aliases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_type" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "organization_aliases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_affiliations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT,
    "department" TEXT,
    "role_type" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TEXT,
    "end_date" TEXT,
    "notes" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "contact_affiliations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contact_affiliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "organization_signals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "confidence" REAL,
    "observed_at" TEXT,
    "source_system" TEXT,
    "source_id" TEXT,
    "source_claim_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "organization_signals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "contacts_tier_idx" ON "contacts"("tier");

-- CreateIndex
CREATE INDEX "contacts_status_idx" ON "contacts"("status");

-- CreateIndex
CREATE INDEX "contacts_last_interaction_date_idx" ON "contacts"("last_interaction_date");

-- CreateIndex
CREATE INDEX "interactions_contact_id_date_idx" ON "interactions"("contact_id", "date" DESC);

-- CreateIndex
CREATE INDEX "interactions_source_system_source_id_idx" ON "interactions"("source_system", "source_id");

-- CreateIndex
CREATE INDEX "intelligence_signals_contact_id_detected_at_idx" ON "intelligence_signals"("contact_id", "detected_at" DESC);

-- CreateIndex
CREATE INDEX "intelligence_signals_detected_at_idx" ON "intelligence_signals"("detected_at" DESC);

-- CreateIndex
CREATE INDEX "intelligence_signals_source_system_source_id_source_claim_id_idx" ON "intelligence_signals"("source_system", "source_id", "source_claim_id");

-- CreateIndex
CREATE INDEX "events_date_start_idx" ON "events"("date_start");

-- CreateIndex
CREATE INDEX "outreach_queue_status_priority_idx" ON "outreach_queue"("status", "priority");

-- CreateIndex
CREATE INDEX "outreach_queue_contact_id_created_at_idx" ON "outreach_queue"("contact_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_relationships_contact_a_id_idx" ON "contact_relationships"("contact_a_id");

-- CreateIndex
CREATE INDEX "contact_relationships_contact_b_id_idx" ON "contact_relationships"("contact_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_relationships_contact_a_id_contact_b_id_key" ON "contact_relationships"("contact_a_id", "contact_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefings_date_key" ON "daily_briefings"("date");

-- CreateIndex
CREATE INDEX "meeting_preps_date_idx" ON "meeting_preps"("date");

-- CreateIndex
CREATE INDEX "meeting_preps_contact_id_date_idx" ON "meeting_preps"("contact_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_cache_date_key" ON "calendar_cache"("date");

-- CreateIndex
CREATE INDEX "commitments_contact_id_idx" ON "commitments"("contact_id");

-- CreateIndex
CREATE INDEX "commitments_fulfilled_due_date_idx" ON "commitments"("fulfilled", "due_date");

-- CreateIndex
CREATE INDEX "commitments_source_system_source_id_idx" ON "commitments"("source_system", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_organization_key" ON "organization_domains"("organization");

-- CreateIndex
CREATE INDEX "enrichment_results_contact_id_idx" ON "enrichment_results"("contact_id");

-- CreateIndex
CREATE INDEX "enrichment_results_status_idx" ON "enrichment_results"("status");

-- CreateIndex
CREATE INDEX "ingestion_items_status_idx" ON "ingestion_items"("status");

-- CreateIndex
CREATE INDEX "ingestion_items_contact_id_idx" ON "ingestion_items"("contact_id");

-- CreateIndex
CREATE INDEX "ingestion_items_created_at_idx" ON "ingestion_items"("created_at");

-- CreateIndex
CREATE INDEX "ingestion_items_cluster_id_idx" ON "ingestion_items"("cluster_id");

-- CreateIndex
CREATE INDEX "ingestion_items_content_hash_idx" ON "ingestion_items"("content_hash");

-- CreateIndex
CREATE INDEX "standing_offers_contact_id_idx" ON "standing_offers"("contact_id");

-- CreateIndex
CREATE INDEX "standing_offers_active_idx" ON "standing_offers"("active");

-- CreateIndex
CREATE INDEX "standing_offers_source_system_source_id_idx" ON "standing_offers"("source_system", "source_id");

-- CreateIndex
CREATE INDEX "scheduling_leads_contact_id_idx" ON "scheduling_leads"("contact_id");

-- CreateIndex
CREATE INDEX "scheduling_leads_status_idx" ON "scheduling_leads"("status");

-- CreateIndex
CREATE INDEX "scheduling_leads_resolved_date_idx" ON "scheduling_leads"("resolved_date");

-- CreateIndex
CREATE INDEX "scheduling_leads_source_system_source_id_idx" ON "scheduling_leads"("source_system", "source_id");

-- CreateIndex
CREATE INDEX "life_events_contact_id_idx" ON "life_events"("contact_id");

-- CreateIndex
CREATE INDEX "life_events_event_date_idx" ON "life_events"("event_date");

-- CreateIndex
CREATE INDEX "life_events_source_system_source_id_idx" ON "life_events"("source_system", "source_id");

-- CreateIndex
CREATE INDEX "referenced_resources_contact_id_idx" ON "referenced_resources"("contact_id");

-- CreateIndex
CREATE INDEX "referenced_resources_source_system_source_id_source_claim_id_idx" ON "referenced_resources"("source_system", "source_id", "source_claim_id");

-- CreateIndex
CREATE INDEX "contact_dossiers_contact_id_version_idx" ON "contact_dossiers"("contact_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contact_dossiers_contact_id_version_key" ON "contact_dossiers"("contact_id", "version");

-- CreateIndex
CREATE INDEX "learning_signals_action_idx" ON "learning_signals"("action");

-- CreateIndex
CREATE INDEX "learning_signals_created_at_idx" ON "learning_signals"("created_at");

-- CreateIndex
CREATE INDEX "contact_pretexts_contact_id_idx" ON "contact_pretexts"("contact_id");

-- CreateIndex
CREATE INDEX "contact_pretexts_used_idx" ON "contact_pretexts"("used");

-- CreateIndex
CREATE INDEX "contact_pretexts_valid_until_idx" ON "contact_pretexts"("valid_until");

-- CreateIndex
CREATE INDEX "contact_provenance_contact_id_idx" ON "contact_provenance"("contact_id");

-- CreateIndex
CREATE INDEX "contact_provenance_source_contact_id_idx" ON "contact_provenance"("source_contact_id");

-- CreateIndex
CREATE INDEX "contact_provenance_contact_id_source_contact_id_idx" ON "contact_provenance"("contact_id", "source_contact_id");

-- CreateIndex
CREATE INDEX "contact_provenance_source_system_source_id_source_claim_id_idx" ON "contact_provenance"("source_system", "source_id", "source_claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "text_contact_comm_stats_phone_number_key" ON "text_contact_comm_stats"("phone_number");

-- CreateIndex
CREATE INDEX "text_contact_comm_stats_contact_id_idx" ON "text_contact_comm_stats"("contact_id");

-- CreateIndex
CREATE INDEX "text_contact_comm_stats_dropped_ball_idx" ON "text_contact_comm_stats"("dropped_ball");

-- CreateIndex
CREATE INDEX "text_contact_comm_stats_total_weighted_score_idx" ON "text_contact_comm_stats"("total_weighted_score" DESC);

-- CreateIndex
CREATE INDEX "personal_activities_source_system_source_id_source_claim_id_idx" ON "personal_activities"("source_system", "source_id", "source_claim_id");

-- CreateIndex
CREATE INDEX "personal_interests_source_system_source_id_source_claim_id_idx" ON "personal_interests"("source_system", "source_id", "source_claim_id");

-- CreateIndex
CREATE INDEX "personal_venues_venue_type_idx" ON "personal_venues"("venue_type");

-- CreateIndex
CREATE INDEX "personal_venues_neighborhood_idx" ON "personal_venues"("neighborhood");

-- CreateIndex
CREATE INDEX "personal_nudges_status_idx" ON "personal_nudges"("status");

-- CreateIndex
CREATE INDEX "personal_nudges_scheduled_for_idx" ON "personal_nudges"("scheduled_for");

-- CreateIndex
CREATE INDEX "social_events_date_idx" ON "social_events"("date");

-- CreateIndex
CREATE INDEX "social_events_event_type_idx" ON "social_events"("event_type");

-- CreateIndex
CREATE INDEX "social_event_attendees_event_id_idx" ON "social_event_attendees"("event_id");

-- CreateIndex
CREATE INDEX "social_event_attendees_contact_id_idx" ON "social_event_attendees"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_event_attendees_event_id_contact_id_key" ON "social_event_attendees"("event_id", "contact_id");

-- CreateIndex
CREATE INDEX "invite_requests_status_idx" ON "invite_requests"("status");

-- CreateIndex
CREATE INDEX "invite_requests_created_at_idx" ON "invite_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "text_group_chats_chat_db_identifier_key" ON "text_group_chats"("chat_db_identifier");

-- CreateIndex
CREATE INDEX "text_messages_contact_id_idx" ON "text_messages"("contact_id");

-- CreateIndex
CREATE INDEX "text_messages_phone_number_idx" ON "text_messages"("phone_number");

-- CreateIndex
CREATE INDEX "text_messages_timestamp_idx" ON "text_messages"("timestamp");

-- CreateIndex
CREATE INDEX "text_messages_chat_db_row_id_idx" ON "text_messages"("chat_db_row_id");

-- CreateIndex
CREATE INDEX "text_messages_group_chat_id_idx" ON "text_messages"("group_chat_id");

-- CreateIndex
CREATE INDEX "content_items_source_type_published_at_idx" ON "content_items"("source_type", "published_at" DESC);

-- CreateIndex
CREATE INDEX "content_items_topic_relevance_score_idx" ON "content_items"("topic_relevance_score" DESC);

-- CreateIndex
CREATE INDEX "content_items_ingestion_status_idx" ON "content_items"("ingestion_status");

-- CreateIndex
CREATE INDEX "content_extractions_content_item_id_idx" ON "content_extractions"("content_item_id");

-- CreateIndex
CREATE INDEX "content_extractions_extraction_type_idx" ON "content_extractions"("extraction_type");

-- CreateIndex
CREATE INDEX "content_extractions_contact_id_idx" ON "content_extractions"("contact_id");

-- CreateIndex
CREATE INDEX "content_extractions_processed_idx" ON "content_extractions"("processed");

-- CreateIndex
CREATE INDEX "discovered_events_status_idx" ON "discovered_events"("status");

-- CreateIndex
CREATE INDEX "discovered_events_source_id_scraped_at_idx" ON "discovered_events"("source_id", "scraped_at" DESC);

-- CreateIndex
CREATE INDEX "discovered_events_topic_relevance_score_idx" ON "discovered_events"("topic_relevance_score" DESC);

-- CreateIndex
CREATE INDEX "draft_corrections_contact_id_idx" ON "draft_corrections"("contact_id");

-- CreateIndex
CREATE INDEX "draft_corrections_purpose_idx" ON "draft_corrections"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "intel_briefs_week_start_key" ON "intel_briefs"("week_start");

-- CreateIndex
CREATE INDEX "podcasts_status_idx" ON "podcasts"("status");

-- CreateIndex
CREATE INDEX "podcasts_tier_idx" ON "podcasts"("tier");

-- CreateIndex
CREATE INDEX "podcast_episodes_podcast_id_published_at_idx" ON "podcast_episodes"("podcast_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "podcast_episodes_is_pitch_window_idx" ON "podcast_episodes"("is_pitch_window");

-- CreateIndex
CREATE INDEX "podcast_episodes_ingestion_status_idx" ON "podcast_episodes"("ingestion_status");

-- CreateIndex
CREATE INDEX "podcast_outreach_podcast_id_created_at_idx" ON "podcast_outreach"("podcast_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "podcast_outreach_outcome_idx" ON "podcast_outreach"("outcome");

-- CreateIndex
CREATE INDEX "triage_feedback_feedback_type_idx" ON "triage_feedback"("feedback_type");

-- CreateIndex
CREATE INDEX "triage_feedback_created_at_idx" ON "triage_feedback"("created_at");

-- CreateIndex
CREATE INDEX "contact_interests_contact_id_idx" ON "contact_interests"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_normalized_name_key" ON "organizations"("normalized_name");

-- CreateIndex
CREATE INDEX "organizations_domain_idx" ON "organizations"("domain");

-- CreateIndex
CREATE INDEX "organizations_normalized_name_idx" ON "organizations"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_aliases_organization_id_alias_key" ON "organization_aliases"("organization_id", "alias");

-- CreateIndex
CREATE INDEX "contact_affiliations_contact_id_idx" ON "contact_affiliations"("contact_id");

-- CreateIndex
CREATE INDEX "contact_affiliations_organization_id_idx" ON "contact_affiliations"("organization_id");

-- CreateIndex
CREATE INDEX "contact_affiliations_source_system_source_id_source_claim_id_idx" ON "contact_affiliations"("source_system", "source_id", "source_claim_id");

-- CreateIndex
CREATE INDEX "organization_signals_organization_id_idx" ON "organization_signals"("organization_id");

-- CreateIndex
CREATE INDEX "organization_signals_signal_type_idx" ON "organization_signals"("signal_type");

-- CreateIndex
CREATE INDEX "organization_signals_source_system_source_id_source_claim_id_idx" ON "organization_signals"("source_system", "source_id", "source_claim_id");

