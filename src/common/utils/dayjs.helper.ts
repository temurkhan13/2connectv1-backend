import dayjs, { Dayjs } from 'dayjs';
import dayOfYear from 'dayjs/plugin/dayOfYear';
import duration from 'dayjs/plugin/duration';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import weekOfYear from 'dayjs/plugin/weekOfYear';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);
dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(weekOfYear);
dayjs.extend(quarterOfYear);
dayjs.extend(dayOfYear);

/**
 * DayjsHelper
 * -----------
 * Purpose:
 * - Provide comprehensive date/time utilities using dayjs.
 * - Simplify common date operations: ranges, formatting, comparisons.
 *
 * Usage:
 * ```typescript
 * const weekRange = DayjsHelper.getWeekRange(0); // Current week
 * const monthRange = DayjsHelper.getMonthRange(0); // Current month
 * const formatted = DayjsHelper.format(date, 'YYYY-MM-DD HH:mm:ss');
 * ```
 */
export class DayjsHelper {
  /**
   * Get current date/time in UTC
   */
  static now(): Dayjs {
    return dayjs().utc();
  }

  /**
   * Parse a date string or Date object
   */
  static parse(date: string | Date | Dayjs | null | undefined): Dayjs {
    if (!date) return this.now();
    return dayjs(date).utc();
  }

  /**
   * Format a date to string
   * @param date Date to format
   * @param format Format pattern (default: 'YYYY-MM-DD HH:mm:ss')
   */
  static format(date: string | Date | Dayjs, format = 'YYYY-MM-DD HH:mm:ss'): string {
    return this.parse(date).format(format);
  }

  /**
   * Get start of day (00:00:00)
   */
  static startOfDay(date?: string | Date | Dayjs): Date {
    return this.parse(date).startOf('day').toDate();
  }

  /**
   * Get end of day (23:59:59.999)
   */
  static endOfDay(date?: string | Date | Dayjs): Date {
    return this.parse(date).endOf('day').toDate();
  }

  /**
   * Get start of week (Monday 00:00:00)
   */
  static startOfWeek(date?: string | Date | Dayjs): Date {
    return this.parse(date).startOf('week').toDate();
  }

  /**
   * Get end of week (Sunday 23:59:59.999)
   */
  static endOfWeek(date?: string | Date | Dayjs): Date {
    return this.parse(date).endOf('week').toDate();
  }

  /**
   * Get start of month (1st, 00:00:00)
   */
  static startOfMonth(date?: string | Date | Dayjs): Date {
    return this.parse(date).startOf('month').toDate();
  }

  /**
   * Get end of month (last day, 23:59:59.999)
   */
  static endOfMonth(date?: string | Date | Dayjs): Date {
    return this.parse(date).endOf('month').toDate();
  }

  /**
   * Get start of year (Jan 1, 00:00:00)
   */
  static startOfYear(date?: string | Date | Dayjs): Date {
    return this.parse(date).startOf('year').toDate();
  }

  /**
   * Get end of year (Dec 31, 23:59:59.999)
   */
  static endOfYear(date?: string | Date | Dayjs): Date {
    return this.parse(date).endOf('year').toDate();
  }

  /**
   * Get week range for a specific week offset
   * @param offset 0 = current week, 1 = last week, etc.
   * @returns { startDate: Date, endDate: Date, label: string }
   */
  static getWeekRange(offset = 0): { startDate: Date; endDate: Date; label: string } {
    const weekStart = this.now().subtract(offset, 'week').startOf('week');
    const weekEnd = weekStart.endOf('week');

    const weekNumber = weekStart.week();
    const year = weekStart.year();

    return {
      startDate: weekStart.toDate(),
      endDate: weekEnd.toDate(),
      label: `W${weekNumber} ${year}`,
    };
  }

  /**
   * Get last N weeks ranges (most recent first)
   * @param weeks Number of weeks to get (default: 6)
   * @returns Array of { startDate, endDate, label }
   */
  static getLastNWeeks(weeks = 6): Array<{ startDate: Date; endDate: Date; label: string }> {
    const result: Array<{ startDate: Date; endDate: Date; label: string }> = [];
    for (let i = 0; i < weeks; i++) {
      result.push(this.getWeekRange(i));
    }
    return result;
  }

  /**
   * Get month range for a specific month offset
   * @param offset 0 = current month, 1 = last month, etc.
   * @returns { startDate: Date, endDate: Date, label: string }
   */
  static getMonthRange(offset = 0): { startDate: Date; endDate: Date; label: string } {
    const monthStart = this.now().subtract(offset, 'month').startOf('month');
    const monthEnd = monthStart.endOf('month');

    const monthName = monthStart.format('MMM');
    const year = monthStart.year();

    return {
      startDate: monthStart.toDate(),
      endDate: monthEnd.toDate(),
      label: `${monthName} ${year}`,
    };
  }

  /**
   * Get last N months ranges (most recent first)
   * @param months Number of months to get (default: 6)
   * @returns Array of { startDate, endDate, label }
   */
  static getLastNMonths(months = 6): Array<{ startDate: Date; endDate: Date; label: string }> {
    const result: Array<{ startDate: Date; endDate: Date; label: string }> = [];
    for (let i = 0; i < months; i++) {
      result.push(this.getMonthRange(i));
    }
    return result;
  }

  /**
   * Get quarter range for a specific quarter offset
   * @param offset 0 = current quarter, 1 = last quarter, etc.
   * @returns { startDate: Date, endDate: Date, label: string }
   */
  static getQuarterRange(offset = 0): { startDate: Date; endDate: Date; label: string } {
    const quarterStart = this.now().subtract(offset, 'quarter').startOf('quarter');
    const quarterEnd = quarterStart.endOf('quarter');

    const quarter = quarterStart.quarter();
    const year = quarterStart.year();

    return {
      startDate: quarterStart.toDate(),
      endDate: quarterEnd.toDate(),
      label: `Q${quarter} ${year}`,
    };
  }

  /**
   * Get day range (start and end of a specific day)
   * @param offset 0 = today, 1 = yesterday, etc.
   * @returns { startDate: Date, endDate: Date, label: string }
   */
  static getDayRange(offset = 0): { startDate: Date; endDate: Date; label: string } {
    const day = this.now().subtract(offset, 'day');
    return {
      startDate: day.startOf('day').toDate(),
      endDate: day.endOf('day').toDate(),
      label: day.format('YYYY-MM-DD'),
    };
  }

  /**
   * Get date range for last N days (most recent first)
   * @param days Number of days to get (default: 7)
   * @returns Array of { startDate, endDate, label }
   */
  static getLastNDays(days = 7): Array<{ startDate: Date; endDate: Date; label: string }> {
    const result: Array<{ startDate: Date; endDate: Date; label: string }> = [];
    for (let i = 0; i < days; i++) {
      result.push(this.getDayRange(i));
    }
    return result;
  }

  /**
   * Add time to a date
   * @param date Base date
   * @param amount Number of units
   * @param unit 'day', 'month', 'year', 'hour', 'minute', 'second', etc.
   */
  static add(date: string | Date | Dayjs, amount: number, unit: dayjs.ManipulateType): Date {
    return this.parse(date).add(amount, unit).toDate();
  }

  /**
   * Subtract time from a date
   */
  static subtract(date: string | Date | Dayjs, amount: number, unit: dayjs.ManipulateType): Date {
    return this.parse(date).subtract(amount, unit).toDate();
  }

  /**
   * Check if date is between two dates
   */
  static isBetween(
    date: string | Date | Dayjs,
    start: string | Date | Dayjs,
    end: string | Date | Dayjs,
    inclusive = true,
  ): boolean {
    const parsed = this.parse(date);
    const parsedStart = this.parse(start);
    const parsedEnd = this.parse(end);

    return parsed.isBetween(parsedStart, parsedEnd, null, inclusive ? '[]' : '()');
  }

  /**
   * Check if date is before another date
   */
  static isBefore(date: string | Date | Dayjs, compareDate: string | Date | Dayjs): boolean {
    return this.parse(date).isBefore(this.parse(compareDate));
  }

  /**
   * Check if date is after another date
   */
  static isAfter(date: string | Date | Dayjs, compareDate: string | Date | Dayjs): boolean {
    return this.parse(date).isAfter(this.parse(compareDate));
  }

  /**
   * Check if date is same or before
   */
  static isSameOrBefore(
    date: string | Date | Dayjs,
    compareDate: string | Date | Dayjs,
    unit?: dayjs.OpUnitType,
  ): boolean {
    return this.parse(date).isSameOrBefore(this.parse(compareDate), unit);
  }

  /**
   * Check if date is same or after
   */
  static isSameOrAfter(
    date: string | Date | Dayjs,
    compareDate: string | Date | Dayjs,
    unit?: dayjs.OpUnitType,
  ): boolean {
    return this.parse(date).isSameOrAfter(this.parse(compareDate), unit);
  }

  /**
   * Get difference between two dates
   * @param from Start date
   * @param to End date
   * @param unit 'day', 'hour', 'minute', 'second', etc.
   */
  static diff(
    from: string | Date | Dayjs,
    to: string | Date | Dayjs,
    unit: dayjs.OpUnitType = 'day',
  ): number {
    return this.parse(from).diff(this.parse(to), unit);
  }

  /**
   * Get human-readable relative time
   * @param date Date to compare to now
   * @param withoutSuffix If true, returns 'in 2 hours' as '2 hours'
   */
  static fromNow(date: string | Date | Dayjs, withoutSuffix = false): string {
    return this.parse(date).fromNow(withoutSuffix);
  }

  /**
   * Get duration between two dates in human-readable format
   */
  static duration(from: string | Date | Dayjs, to: string | Date | Dayjs): string {
    const ms = Math.abs(this.diff(from, to, 'millisecond'));
    return dayjs.duration(ms).format('D[d] H[h] m[m] s[s]');
  }

  /**
   * Get age in years from a birth date
   */
  static getAge(birthDate: string | Date | Dayjs): number {
    return this.now().diff(this.parse(birthDate), 'year');
  }

  /**
   * Check if dates are on the same day
   */
  static isSameDay(date1: string | Date | Dayjs, date2: string | Date | Dayjs): boolean {
    return this.parse(date1).isSame(this.parse(date2), 'day');
  }

  /**
   * Check if dates are in the same month
   */
  static isSameMonth(date1: string | Date | Dayjs, date2: string | Date | Dayjs): boolean {
    return this.parse(date1).isSame(this.parse(date2), 'month');
  }

  /**
   * Check if dates are in the same year
   */
  static isSameYear(date1: string | Date | Dayjs, date2: string | Date | Dayjs): boolean {
    return this.parse(date1).isSame(this.parse(date2), 'year');
  }

  /**
   * Get array of dates between two dates
   * @param from Start date
   * @param to End date
   * @param unit 'day', 'hour', 'month', etc.
   */
  static getDatesBetween(
    from: string | Date | Dayjs,
    to: string | Date | Dayjs,
    unit: dayjs.ManipulateType = 'day',
  ): Date[] {
    const dates: Date[] = [];
    let current = this.parse(from);
    const end = this.parse(to);

    while (current.isSameOrBefore(end)) {
      dates.push(current.toDate());
      current = current.add(1, unit);
    }

    return dates;
  }

  /**
   * Get timestamp in milliseconds
   */
  static timestamp(date?: string | Date | Dayjs): number {
    return this.parse(date).valueOf();
  }

  /**
   * Get Unix timestamp in seconds
   */
  static unix(date?: string | Date | Dayjs): number {
    return this.parse(date).unix();
  }

  /**
   * Create date from Unix timestamp (seconds)
   */
  static fromUnix(timestamp: number): Date {
    return dayjs.unix(timestamp).toDate();
  }
}
