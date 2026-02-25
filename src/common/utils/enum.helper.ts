/**
 * Utility helpers for enum labels
 */
export function makeLabelForEnums(s: string): string {
  if (!s) return '';
  return s
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default makeLabelForEnums;
