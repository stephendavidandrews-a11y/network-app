import { PrismaClient } from "@prisma/client";
import { ORG_SHORTHAND_MAP, CANONICAL_DISPLAY_NAMES } from "./orgShorthand";
import { passesOrgQualityGate } from "./orgQualityGate";

export interface OrgResolutionResult {
  organization: any | null; // Prisma Organization or null
  resolutionSource:
    | "exact_name"
    | "alias"
    | "curated_shorthand"
    | "auto_created"
    | "provisional_suggestion";
  created: boolean;
}

export function normalizeOrgName(raw: string): string {
  let s = raw.trim();
  // Strip leading "the " (word boundary)
  s = s.replace(/^the\s+/i, "");
  // Strip trailing possessive "'s"
  s = s.replace(/'s$/i, "");
  // Strip periods (U.S. → US)
  s = s.replace(/\./g, "");
  // Strip commas
  s = s.replace(/,/g, "");
  // Lowercase
  s = s.toLowerCase();
  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export async function resolveOrganization(
  prisma: PrismaClient,
  rawName: string
): Promise<OrgResolutionResult> {
  const normalized = normalizeOrgName(rawName);
  if (!normalized)
    return {
      organization: null,
      resolutionSource: "provisional_suggestion",
      created: false,
    };

  // 1. Exact normalized name match
  const exactMatch = await prisma.organization.findUnique({
    where: { normalizedName: normalized },
  });
  if (exactMatch)
    return {
      organization: exactMatch,
      resolutionSource: "exact_name",
      created: false,
    };

  // 2. Alias match (normalized)
  const aliasMatch = await prisma.organizationAlias.findFirst({
    where: { alias: normalized },
    include: { organization: true },
  });
  if (aliasMatch)
    return {
      organization: aliasMatch.organization,
      resolutionSource: "alias",
      created: false,
    };

  // 3. Curated shorthand
  const canonicalNormalized = ORG_SHORTHAND_MAP.get(normalized);
  if (canonicalNormalized) {
    let org = await prisma.organization.findUnique({
      where: { normalizedName: canonicalNormalized },
    });
    if (!org) {
      // Shorthand resolved but org doesn't exist yet — create it
      const displayName =
        CANONICAL_DISPLAY_NAMES.get(canonicalNormalized) || rawName;
      org = await prisma.organization.create({
        data: { name: displayName, normalizedName: canonicalNormalized },
      });
      return {
        organization: org,
        resolutionSource: "curated_shorthand",
        created: true,
      };
    }
    return {
      organization: org,
      resolutionSource: "curated_shorthand",
      created: false,
    };
  }

  // 4. Quality gate (runs on RAW input for casing heuristics)
  if (!passesOrgQualityGate(rawName, normalized)) {
    return {
      organization: null,
      resolutionSource: "provisional_suggestion",
      created: false,
    };
  }

  // 5. Auto-create (passed quality gate)
  const newOrg = await prisma.organization.create({
    data: { name: rawName.trim(), normalizedName: normalized },
  });
  return {
    organization: newOrg,
    resolutionSource: "auto_created",
    created: true,
  };
}
