/**
 * profile-anonymize.util — shared persona anonymization for cross-user views.
 *
 * ## Why this lives here
 *
 * `user_summaries.summary` is stored RAW (real names, cheque sizes, etc.)
 * because the owner's profile page legitimately reads their own summary as
 * markdown and expects the full text (see `profile.service.ts:getSummary`
 * which reads with `raw: true`).
 *
 * But when the same summary is shown to OTHER users — Discover cards,
 * future admin/analytics views, match preview overlays, email digests —
 * it must be anonymized first (name strip, username/email scrub, legacy
 * JSON cleanup, markdown→structured-sections rewrite).
 *
 * Previously the anonymization lived as PRIVATE methods inside
 * `discover.service.ts`. Any future module reading `user_summaries.summary`
 * and forwarding to non-owner would silently leak real names, because the
 * sanitization was locked to Discover. Moving the functions here makes the
 * sanctioned path discoverable: IDE import + a clearly-named function
 * signal intent.
 *
 * ## When to use
 *
 * - YES: rendering another user's summary on any public / cross-user
 *   surface (Discover, match card overlays, emails, admin exports to
 *   non-privileged viewers, analytics dumps shared outside the platform
 *   team, ...). Call `anonymizeForCrossUserView()`.
 * - NO: rendering the OWNER's own summary on their own profile page.
 *   `profile.service.ts:getSummary` does this and reads raw intentionally.
 * - NO: internal scoring / match-explanation LLM calls that consume the
 *   persona fields directly from `user_profiles.persona_*` (preferred
 *   source of truth for internal reads).
 *
 * ## Provenance
 *
 * Extracted from `discover.service.ts` in [[Apr-18]] Follow-up 27. See
 * `C:/Users/hp/2ConnectVault/Sessions/2026/04/Apr-18.md` Follow-up 27
 * "Discover page verification" for context. Dollar-amount substitution
 * that was removed same session — cheque sizes are signal, not PII — so
 * `removeSummaryPII` below no longer redacts monetary amounts.
 */

// Stop-words excluded from name-stripping (Apr-17 fix).
//
// Historical context: Source 2 (markdown header extraction) split the
// header on whitespace and stripped every word, which caused archetype
// headers like "# The Executive Tech Talent Connector" to obliterate
// common English words from prose.
const NAME_STRIP_STOPWORDS = new Set([
  'the', 'a', 'an',
  'founder', 'founders', 'entrepreneur', 'entrepreneurs',
  'investor', 'investors', 'angel', 'vc', 'partner', 'partners',
  'executive', 'executives', 'manager', 'director', 'president',
  'cto', 'ceo', 'cfo', 'coo', 'cmo', 'cpo', 'cro', 'chro',
  'vp', 'svp', 'evp', 'lead', 'leader', 'leadership',
  'engineer', 'engineering', 'developer', 'architect', 'technical',
  'product', 'design', 'designer', 'marketing', 'sales', 'finance',
  'operations', 'legal', 'hr', 'people', 'talent', 'recruiter',
  'consultant', 'advisor', 'mentor', 'coach', 'strategist',
  'specialist', 'professional', 'expert', 'veteran',
  'tech', 'technology', 'saas', 'software', 'ai', 'ml', 'data',
  'fintech', 'healthtech', 'edtech', 'climatetech',
  'connector', 'builder', 'operator', 'pioneer',
]);

/**
 * Public entrypoint: given a persona summary (raw markdown or legacy JSON),
 * produce a clean, identity-stripped text suitable for showing to users
 * other than the summary's owner.
 */
export function anonymizeForCrossUserView(summary: string): string {
  if (!summary) return '';

  const trimmed = summary.trim();

  // Handle raw JSON summaries (legacy)
  if (trimmed.startsWith('{') && trimmed.includes('"')) {
    return anonymizeJsonSummary(trimmed);
  }

  // Detect test accounts
  const lower = summary.toLowerCase();
  if (
    lower.startsWith('test ') ||
    lower.includes('test ai summary') ||
    lower.includes('ai summary for')
  ) {
    return 'A professional seeking meaningful connections.';
  }

  // Parse markdown summary into sections
  const sections = parseMarkdownSections(summary);

  // Build clean anonymous summary from sections
  const parts: string[] = [];

  // Industry + Stage line
  const industry = sections['Industry Focus'] || sections['Industry'];
  const stage = sections['Stage'];
  if (industry && industry !== 'Not specified') {
    let line = `Industry: ${industry}`;
    if (stage && stage !== 'Not specified') line += ` · ${stage}`;
    parts.push(line);
  } else if (stage && stage !== 'Not specified') {
    parts.push(`Stage: ${stage}`);
  }

  // Experience
  const experience = sections['Experience'];
  if (experience && experience !== 'Not specified') {
    parts.push(`Experience: ${experience}`);
  }

  // Skills
  const skills = sections['Skills & Expertise'] || sections['Skills'];
  if (skills && skills !== 'Not specified') {
    parts.push(`Skills: ${skills}`);
  }

  // What they offer
  const offerings = sections['What I Can Offer'] || sections['Offerings'];
  if (offerings && offerings !== 'Not specified') {
    const offerText =
      offerings.length > 120 ? offerings.substring(0, 120) + '...' : offerings;
    parts.push(`Offers: ${offerText}`);
  }

  // What they're looking for
  const requirements =
    sections["What I'm Looking For"] ||
    sections['Looking For'] ||
    sections['Requirements'];
  if (requirements && requirements !== 'Not specified') {
    const reqText =
      requirements.length > 120
        ? requirements.substring(0, 120) + '...'
        : requirements;
    parts.push(`Looking for: ${reqText}`);
  }

  // Key achievement
  const achievement = sections['Key Achievement'];
  if (achievement && achievement !== 'Not specified') {
    parts.push(`Achievement: ${achievement}`);
  }

  if (parts.length === 0) {
    // Fallback: clean the raw text
    return cleanRawText(summary);
  }

  // Remove PII from the result
  let result = parts.join(' · ');
  result = removeSummaryPII(result);

  // Limit length
  if (result.length > 350) {
    const truncated = result.substring(0, 347);
    const lastDot = truncated.lastIndexOf('·');
    result =
      lastDot > 200 ? truncated.substring(0, lastDot).trim() : truncated + '...';
  }

  return result;
}

/**
 * PII scrub — regex cleanup for emails, usernames, company suffixes,
 * long numeric strings, and stray `[Name]`/`[Company]` placeholders.
 *
 * Dollar-amount substitution was removed [[Apr-18]] Follow-up 27 — ranges
 * like `$25K–$100K` double-substituted into `significant funding–significant
 * funding`, and cheque sizes aren't PII on their own (the name-strip
 * handles identity). Kept exposed so future callers can run PII sweep
 * on text that didn't come from the summary parser.
 */
export function removeSummaryPII(text: string): string {
  return text
    .replace(/\b[a-z]+[._][a-z]+\d*\b/gi, '') // username patterns
    .replace(/\bfor\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\b/g, '') // "for John Smith"
    .replace(
      /\b(a |an |the )?[A-Z][a-zA-Z]+\s+(Inc|LLC|Ltd|Corp|Company|Co)\.?\b/gi,
      'a company',
    ) // company names
    .replace(/\b\d{10,}\b/g, '') // long numbers
    .replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      '',
    ) // emails
    .replace(/\[Name\]/gi, '')
    .replace(/\[Company\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------
// Internal helpers (not exported — callers should use the main entrypoint)
// ---------------------------------------------------------------------

/**
 * Parse markdown with `##` headers into key-value sections.
 *
 * Exported so callers that only want the structured parse (e.g.
 * `DiscoverService.extractObjectives` which pulls the `Primary Goal`
 * section from raw summaries for filter-chip derivation) can reuse the
 * logic without re-implementing it. NOT an anonymization step on its
 * own — the result still contains identity; pipe through
 * `anonymizeForCrossUserView` before any cross-user display.
 */
export function parseMarkdownSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = markdown.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const trimLine = line.trim();

    // Skip the top-level # header (contains identity — anonymize)
    if (trimLine.startsWith('# ') && !trimLine.startsWith('## ')) continue;

    // Detect ## section headers
    const headerMatch = trimLine.match(/^#{2,}\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      continue;
    }

    // Skip metadata lines
    if (trimLine.startsWith('*') && trimLine.endsWith('*')) continue; // Italic disclaimers
    if (trimLine === '---') continue; // Horizontal rules
    if (!trimLine) continue; // Empty lines

    // Accumulate content under current section
    if (currentSection) {
      const existing = sections[currentSection] || '';
      sections[currentSection] = existing ? `${existing}; ${trimLine}` : trimLine;
    }
  }

  return sections;
}

/**
 * Handle legacy JSON summaries.
 */
function anonymizeJsonSummary(json: string): string {
  try {
    const parsed = JSON.parse(json);
    const parts: string[] = [];

    const industry = parsed.industry || parsed.focus;
    if (industry) {
      const str = Array.isArray(industry) ? industry.slice(0, 3).join(', ') : industry;
      if (str.length > 2) parts.push(`Industry: ${str}`);
    }
    if (parsed.stage) parts.push(`Stage: ${parsed.stage}`);

    const goal = parsed.goal || parsed.objective;
    if (goal && goal.length > 5) {
      parts.push(
        `Looking for: ${goal.length > 80 ? goal.substring(0, 80) + '...' : goal}`,
      );
    }
    if (parsed.offerings && parsed.offerings.length > 10) {
      parts.push(`Offers: ${parsed.offerings.substring(0, 80)}`);
    }

    return parts.length > 0
      ? parts.join(' · ')
      : 'A professional seeking meaningful connections.';
  } catch {
    return 'A professional seeking meaningful connections.';
  }
}

/**
 * Fallback: clean raw text when markdown parsing yields nothing usable.
 */
function cleanRawText(text: string): string {
  let cleaned = text
    .replace(/\\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/#+\s*/g, '')
    .replace(/\*[^*]+\*/g, '') // Remove italic text
    .replace(/---/g, '')
    .replace(/Not specified/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = removeSummaryPII(cleaned);

  if (cleaned.length > 300) {
    const truncated = cleaned.substring(0, 297);
    const lastPeriod = truncated.lastIndexOf('.');
    cleaned = lastPeriod > 200 ? truncated.substring(0, lastPeriod + 1) : truncated + '...';
  }

  return cleaned || 'A professional seeking meaningful connections.';
}

// Re-export stopwords for callers that do name-strip at a different layer.
export { NAME_STRIP_STOPWORDS };
