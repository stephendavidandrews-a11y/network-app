-- Step 4 (Wave 2): Add industry field to organizations table.
-- industry = sector/domain the org operates in (e.g. Government/Regulatory, Market Infrastructure)
-- DISTINCT from org_type which is what kind of institution it is (e.g. regulator, exchange, bank)

ALTER TABLE "organizations" ADD COLUMN "industry" TEXT;

-- Seed industries for canonical orgs
UPDATE "organizations" SET "industry" = 'Government/Regulatory' WHERE "id" = 'seed-cftc';
UPDATE "organizations" SET "industry" = 'Government/Regulatory' WHERE "normalized_name" = 'securities and exchange commission';
UPDATE "organizations" SET "industry" = 'Government/Regulatory' WHERE "normalized_name" = 'federal reserve';
UPDATE "organizations" SET "industry" = 'Government/Regulatory' WHERE "normalized_name" = 'department of the treasury' OR "normalized_name" = 'us treasury';
UPDATE "organizations" SET "industry" = 'Market Infrastructure' WHERE "normalized_name" = 'cme group';
UPDATE "organizations" SET "industry" = 'Market Infrastructure' WHERE "normalized_name" = 'intercontinental exchange';
UPDATE "organizations" SET "industry" = 'Market Infrastructure' WHERE "normalized_name" = 'dtcc' OR "normalized_name" = 'depository trust clearing corporation';
