-- CreateTable: organization_classifications
-- OrganizationClassification = narrower regulatory/institutional category membership
-- DISTINCT from orgType (broad institutional kind) and industry (sector/domain)
CREATE TABLE "organization_classifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "classification_type" TEXT NOT NULL,
    "classification_system" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT 1,
    "effective_date" TEXT,
    "end_date" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "organization_classifications_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_classifications_organization_id_classification_type_classification_system_key"
  ON "organization_classifications"("organization_id", "classification_type", "classification_system");
CREATE INDEX "organization_classifications_classification_type_idx"
  ON "organization_classifications"("classification_type");
CREATE INDEX "organization_classifications_classification_system_idx"
  ON "organization_classifications"("classification_system");
CREATE INDEX "organization_classifications_organization_id_idx"
  ON "organization_classifications"("organization_id");

-- Seed grounded classifications (only orgs known to exist from prior migrations)
-- CFTC = federal_agency
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'federal_agency', 'government_body', datetime('now'), datetime('now')
FROM organizations WHERE id = 'seed-cftc';

-- SEC = federal_agency
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'federal_agency', 'government_body', datetime('now'), datetime('now')
FROM organizations WHERE normalized_name = 'securities and exchange commission';

-- Federal Reserve = federal_agency
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'federal_agency', 'government_body', datetime('now'), datetime('now')
FROM organizations WHERE normalized_name = 'federal reserve system' OR id = 'seed-fed';

-- Treasury = federal_agency
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'federal_agency', 'government_body', datetime('now'), datetime('now')
FROM organizations WHERE normalized_name = 'us department of treasury' OR id = 'seed-treasury';

-- CME Group = DCM
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'DCM', 'market_infrastructure', datetime('now'), datetime('now')
FROM organizations WHERE normalized_name = 'cme group';

-- ICE = DCM
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'DCM', 'market_infrastructure', datetime('now'), datetime('now')
FROM organizations WHERE normalized_name = 'intercontinental exchange';

-- DTCC = SDR
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'SDR', 'market_infrastructure', datetime('now'), datetime('now')
FROM organizations WHERE normalized_name = 'depository trust and clearing corporation' OR id = 'seed-dtcc';

-- NFA = SRO
INSERT INTO "organization_classifications" ("id", "organization_id", "classification_type", "classification_system", "created_at", "updated_at")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       id, 'SRO', 'market_infrastructure', datetime('now'), datetime('now')
FROM organizations WHERE normalized_name = 'national futures association';
-- Note: NFA org does not exist yet; this INSERT will match zero rows until NFA is created.
