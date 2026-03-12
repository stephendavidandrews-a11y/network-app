const STOPLIST = new Set([
  "the team", "compliance", "their office", "the exchange", "the agency",
  "the firm", "the company", "the group", "the committee", "the department",
  "the bureau", "the board", "our office", "my team", "the organization",
  "headquarters", "our team", "his office", "her office", "the office",
  "the staff", "our group", "the regulator", "the regulators",
  "our company", "their firm", "the bank", "a bank", "some firm",
  "my office", "your office", "his team", "her team", "your team",
  "the market", "the industry", "the sector", "the government",
]);

// Bare category terms — not standalone orgs
const CATEGORY_TERMS = new Set([
  "dco", "dcm", "sef", "sdr", "fcm", "cpo", "cta", "sd", "msp",
  "bank", "committee", "exchange", "regulator", "broker", "dealer",
  "clearinghouse", "swap dealer", "futures commission merchant",
]);

// Words that signal a generic/pronominal reference, not a real org name
const GENERIC_PREFIXES = new Set([
  "the", "a", "an", "my", "our", "your", "his", "her", "their",
  "some", "that", "this", "those", "these",
]);

/**
 * Quality gate for org name auto-creation.
 * Returns true if the name is good enough to auto-create as an Organization.
 *
 * Design: Does NOT rely on casing (extraction often lowercases names).
 * Instead uses structural heuristics:
 *   1. Reject stoplist and category terms (explicit blocklist)
 *   2. Reject single-word names that are generic (too ambiguous)
 *   3. Reject names that start with a pronoun/article + single generic noun
 *   4. Accept multi-word names (2+ words after stripping articles) as likely entity names
 *   5. Accept single words that are ≥4 chars and not on any blocklist (acronyms, proper nouns)
 */
export function passesOrgQualityGate(rawName: string, normalizedName: string): boolean {
  // Too short
  if (normalizedName.length < 2) return false;

  // Stoplist (exact match against normalized)
  if (STOPLIST.has(normalizedName)) return false;

  // Category terms (exact match against normalized)
  if (CATEGORY_TERMS.has(normalizedName)) return false;

  // Split into words
  const words = normalizedName.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return false;

  // Strip leading generic prefix for structural analysis
  const coreWords = GENERIC_PREFIXES.has(words[0]) ? words.slice(1) : words;
  if (coreWords.length === 0) return false;

  // Single core word: must be at least 4 chars (likely acronym or proper noun)
  // and not a category term
  if (coreWords.length === 1) {
    const word = coreWords[0];
    if (word.length < 4) return false;
    if (CATEGORY_TERMS.has(word)) return false;
    // Reject obviously generic single words
    const GENERIC_SINGLES = new Set([
      "office", "team", "firm", "company", "group", "department",
      "bureau", "board", "staff", "agency", "organization",
      "division", "unit", "branch", "section", "headquarters",
      "market", "industry", "sector", "government", "commission",
    ]);
    if (GENERIC_SINGLES.has(word)) return false;
    return true;
  }

  // Multi-word (2+ core words): very likely a real org name
  // e.g., "goldman sachs", "jpmorgan chase", "deloitte consulting"
  // The stoplist already catches generic phrases like "the team", "our office"
  return true;
}
