-- Add resolutionSource columns
ALTER TABLE "contact_affiliations" ADD COLUMN "resolution_source" TEXT;
ALTER TABLE "organization_signals" ADD COLUMN "resolution_source" TEXT;

-- Seed canonical organizations
INSERT OR IGNORE INTO "organizations" ("id", "name", "normalized_name", "org_type", "is_active", "created_at", "updated_at")
VALUES
  ('seed-cftc', 'Commodity Futures Trading Commission', 'commodity futures trading commission', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-sec', 'Securities and Exchange Commission', 'securities and exchange commission', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-fed', 'Federal Reserve System', 'federal reserve system', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-treasury', 'U.S. Department of the Treasury', 'us department of treasury', 'government_agency', 1, datetime('now'), datetime('now')),
  ('seed-occ', 'Office of the Comptroller of the Currency', 'office of comptroller of currency', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-fdic', 'Federal Deposit Insurance Corporation', 'federal deposit insurance corporation', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-fhfa', 'Federal Housing Finance Agency', 'federal housing finance agency', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-fca', 'Farm Credit Administration', 'farm credit administration', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-ncua', 'National Credit Union Administration', 'national credit union administration', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-ftc', 'Federal Trade Commission', 'federal trade commission', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-cfpb', 'Consumer Financial Protection Bureau', 'consumer financial protection bureau', 'regulator', 1, datetime('now'), datetime('now')),
  ('seed-doj', 'Department of Justice', 'department of justice', 'government_agency', 1, datetime('now'), datetime('now')),
  ('seed-senate-ag', 'Senate Committee on Agriculture, Nutrition, and Forestry', 'senate committee on agriculture nutrition and forestry', 'legislature', 1, datetime('now'), datetime('now')),
  ('seed-senate-banking', 'Senate Committee on Banking, Housing, and Urban Affairs', 'senate committee on banking housing and urban affairs', 'legislature', 1, datetime('now'), datetime('now')),
  ('seed-house-ag', 'House Committee on Agriculture', 'house committee on agriculture', 'legislature', 1, datetime('now'), datetime('now')),
  ('seed-house-fs', 'House Committee on Financial Services', 'house committee on financial services', 'legislature', 1, datetime('now'), datetime('now')),
  ('seed-cme', 'CME Group', 'cme group', 'exchange', 1, datetime('now'), datetime('now')),
  ('seed-ice', 'Intercontinental Exchange', 'intercontinental exchange', 'exchange', 1, datetime('now'), datetime('now')),
  ('seed-dtcc', 'Depository Trust & Clearing Corporation', 'depository trust and clearing corporation', 'clearinghouse', 1, datetime('now'), datetime('now'));

-- Seed aliases (shorthand → canonical org)
INSERT OR IGNORE INTO "organization_aliases" ("id", "organization_id", "alias", "alias_type", "created_at")
VALUES
  ('alias-cftc', 'seed-cftc', 'cftc', 'acronym', datetime('now')),
  ('alias-sec', 'seed-sec', 'sec', 'acronym', datetime('now')),
  ('alias-fed-1', 'seed-fed', 'fed', 'common_name', datetime('now')),
  ('alias-fed-2', 'seed-fed', 'federal reserve', 'common_name', datetime('now')),
  ('alias-fed-3', 'seed-fed', 'federal reserve board', 'common_name', datetime('now')),
  ('alias-fed-4', 'seed-fed', 'board of governors', 'common_name', datetime('now')),
  ('alias-treasury-1', 'seed-treasury', 'treasury', 'common_name', datetime('now')),
  ('alias-treasury-2', 'seed-treasury', 'us treasury', 'common_name', datetime('now')),
  ('alias-treasury-3', 'seed-treasury', 'treasury department', 'common_name', datetime('now')),
  ('alias-occ', 'seed-occ', 'occ', 'acronym', datetime('now')),
  ('alias-fdic', 'seed-fdic', 'fdic', 'acronym', datetime('now')),
  ('alias-fhfa', 'seed-fhfa', 'fhfa', 'acronym', datetime('now')),
  ('alias-fca', 'seed-fca', 'fca', 'acronym', datetime('now')),
  ('alias-ncua', 'seed-ncua', 'ncua', 'acronym', datetime('now')),
  ('alias-ftc', 'seed-ftc', 'ftc', 'acronym', datetime('now')),
  ('alias-cfpb', 'seed-cfpb', 'cfpb', 'acronym', datetime('now')),
  ('alias-doj', 'seed-doj', 'doj', 'acronym', datetime('now')),
  ('alias-senate-ag-1', 'seed-senate-ag', 'senate ag', 'common_name', datetime('now')),
  ('alias-senate-ag-2', 'seed-senate-ag', 'senate agriculture', 'common_name', datetime('now')),
  ('alias-senate-banking', 'seed-senate-banking', 'senate banking', 'common_name', datetime('now')),
  ('alias-house-ag-1', 'seed-house-ag', 'house ag', 'common_name', datetime('now')),
  ('alias-house-ag-2', 'seed-house-ag', 'house agriculture', 'common_name', datetime('now')),
  ('alias-house-fs', 'seed-house-fs', 'house financial services', 'common_name', datetime('now')),
  ('alias-cme-1', 'seed-cme', 'cme', 'acronym', datetime('now')),
  ('alias-cme-2', 'seed-cme', 'chicago mercantile exchange', 'common_name', datetime('now')),
  ('alias-ice', 'seed-ice', 'ice', 'acronym', datetime('now')),
  ('alias-dtcc', 'seed-dtcc', 'dtcc', 'acronym', datetime('now'));
