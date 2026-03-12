-- Add relatedOrg and relationshipType to organization_signals
-- Supports org_relationship signals from Sauron that include cross-org relationship metadata
ALTER TABLE "organization_signals" ADD COLUMN "related_org" TEXT;
ALTER TABLE "organization_signals" ADD COLUMN "relationship_type" TEXT;
