const STOPLIST = new Set([
  "the team", "compliance", "their office", "the exchange", "the agency",
  "the firm", "the company", "the group", "the committee", "the department",
  "the bureau", "the board", "our office", "my team", "the organization",
  "headquarters", "our team", "his office", "her office", "the office",
  "the staff", "our group", "the regulator", "the regulators",
  "our company", "their firm", "the bank", "a bank", "some firm",
]);

// Bare category terms — not standalone orgs
const CATEGORY_TERMS = new Set([
  "dco", "dcm", "sef", "sdr", "fcm", "cpo", "cta", "sd", "msp",
  "bank", "committee", "exchange", "regulator", "broker", "dealer",
  "clearinghouse", "swap dealer", "futures commission merchant",
]);

/**
 * Quality gate for org name auto-creation.
 * Runs on RAW input (before normalization) for casing heuristics.
 * Returns true if the name is good enough to auto-create.
 */
export function passesOrgQualityGate(rawName: string, normalizedName: string): boolean {
  // Too short
  if (normalizedName.length < 2) return false;

  // Stoplist (checked against normalized)
  if (STOPLIST.has(normalizedName)) return false;

  // Category terms (checked against normalized)
  if (CATEGORY_TERMS.has(normalizedName)) return false;

  // Form heuristic on RAW input (casing available):
  // Must have at least one uppercase letter, OR be >3 words, OR be >15 chars
  const hasUppercase = /[A-Z]/.test(rawName);
  const wordCount = rawName.trim().split(/\s+/).length;
  const isLongEnough = rawName.trim().length > 15;

  if (!hasUppercase && wordCount <= 3 && !isLongEnough) return false;

  return true;
}
