-- Add isPrimary to contact_affiliations
-- isPrimary is a policy field indicating the contact's primary current institutional identity.
-- Conservative: defaults to false. Only the sync decision tree or explicit user action sets true.
ALTER TABLE "contact_affiliations" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT 0;
