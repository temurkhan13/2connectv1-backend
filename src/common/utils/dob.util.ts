/**
 * dobFromAge
 * ----------
 * Purpose:
 * - Convert an age (whole years) to a UTC-based DOB string in 'YYYY-MM-DD'.
 *
 * Summary:
 * - Uses UTC parts to avoid timezone issues.
 * - Keeps month/day equal to "today" (UTC) and subtracts `age` from the year.
 * - Returns a Sequelize DATEONLY-friendly string.
 */

export function dobFromAge(age: string, now = new Date()) {
  const n = Number(age);

  // Validate input: integer in range [0, 130]
  if (!Number.isInteger(n) || n < 0 || n > 130) {
    return null;
  }

  // Use UTC to prevent date shifts
  const y = now.getUTCFullYear() - n; // birth year
  const m = now.getUTCMonth() + 1; // 1-12
  const d = now.getUTCDate(); // 1-31

  // Zero-pad month/day
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');

  // Final DATEONLY string
  return `${y}-${mm}-${dd}`;
}
