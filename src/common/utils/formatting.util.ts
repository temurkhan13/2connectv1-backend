/**
 * Formatting Utilities
 * ====================
 * Purpose:
 * - Centralized utility functions for data formatting and transformation.
 * - Used across services for consistent data presentation.
 *
 * Exported Functions:
 * - calculateAge: Calculate age from date of birth
 * - capitalizeFirstLetter: Capitalize first letter of string
 * - formatStatus: Format status enums to display-friendly strings
 */

/**
 * Calculate Age from Date of Birth
 * --------------------------------
 * Calculates the person's age based on their date of birth.
 * Handles edge cases where birthday hasn't occurred yet this year.
 *
 * @param dateOfBirth - Date of birth string or Date object (ISO format: YYYY-MM-DD)
 * @returns Age in years as number
 *
 * Example:
 * calculateAge('1998-10-21') // Returns current age
 * calculateAge(new Date('1998-10-21')) // Also works with Date object
 */
export function calculateAge(dateOfBirth: string | Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);

  // Handle invalid dates
  if (isNaN(birthDate.getTime())) {
    throw new Error('Invalid date of birth');
  }

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  // If birthday hasn't occurred yet this year, subtract 1
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Capitalize First Letter
 * ----------------------
 * Capitalizes the first letter of a string and lowercases the rest.
 *
 * @param str - Input string
 * @returns String with first letter capitalized
 *
 * Example:
 * capitalizeFirstLetter('john') // Returns 'John'
 * capitalizeFirstLetter('MALE') // Returns 'Male'
 */
export function capitalizeFirstLetter(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Format Status Text
 * -----------------
 * Converts database status values (snake_case) to display-friendly format.
 * Used for onboarding status, account status, and other enum values.
 *
 * Status Mappings:
 * - 'not_started' → 'Not started'
 * - 'in_progress' → 'In progress'
 * - 'completed' → 'Completed'
 * - 'active' → 'Active'
 * - 'inactive' → 'Inactive'
 * - 'male' → 'Male'
 * - 'female' → 'Female'
 * - 'other' → 'Other'
 *
 * @param status - Status string in snake_case format
 * @returns Formatted status string with proper capitalization
 *
 * Example:
 * formatStatus('not_started') // Returns 'Not started'
 * formatStatus('in_progress') // Returns 'In progress'
 * formatStatus('completed') // Returns 'Completed'
 */
export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    // Onboarding statuses
    not_started: 'Not started',
    in_progress: 'In progress',
    completed: 'Completed',
    // Account statuses
    active: 'Active',
    inactive: 'Inactive',
    // Gender values
    male: 'Male',
    female: 'Female',
    other: 'Other',
  };

  return statusMap[status] || capitalizeFirstLetter(status);
}

/**
 * Format User Gender
 * -----------------
 * Formats gender value with proper capitalization.
 *
 * @param gender - Gender string (male, female, other)
 * @returns Formatted gender string
 *
 * Example:
 * formatGender('male') // Returns 'Male'
 */
export function formatGender(gender: string): string {
  return formatStatus(gender);
}

/**
 * Format Onboarding Status
 * -----------------------
 * Formats onboarding status with proper capitalization.
 *
 * @param status - Onboarding status (not_started, in_progress, completed)
 * @returns Formatted status string
 *
 * Example:
 * formatOnboardingStatus('completed') // Returns 'Completed'
 */
export function formatOnboardingStatus(status: string): string {
  return formatStatus(status);
}

/**
 * Format Account Status
 * --------------------
 * Formats account status (active/inactive) to boolean or display string.
 *
 * @param isActive - Boolean or string representing account status
 * @returns 'Active' or 'Inactive'
 *
 * Example:
 * formatAccountStatus(true) // Returns 'Active'
 * formatAccountStatus(false) // Returns 'Inactive'
 */
export function formatAccountStatus(isActive: boolean | string): string {
  if (typeof isActive === 'string') {
    return formatStatus(isActive);
  }
  return isActive ? 'Active' : 'Inactive';
}
