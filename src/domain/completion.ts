/** Build ISO completion_date from year + optional month (day defaults to 01). */
export const completionDateFromParts = (year: string, month: string): string | null => {
  const yearNumber = Number(year.trim());
  if (!Number.isInteger(yearNumber) || yearNumber < 1000) return null;
  const monthNumber = month.trim() === '' ? null : Number(month);
  if (monthNumber === null) return null;
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;
  return `${yearNumber}-${String(monthNumber).padStart(2, '0')}-01`;
};

export const completionMonthFromDate = (isoDate: string | null): string => {
  if (!isoDate) return '';
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return '';
  return String(new Date(parsed).getUTCMonth() + 1);
};
