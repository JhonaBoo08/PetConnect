const shortMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const parts = iso.split('-').map((part) => Number(part));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  if (year < 1900 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function parseIsoDate(iso: string): Date | null {
  const parts = parseIso(iso);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

export function toLongDate(date: Date): string {
  return `${shortMonths[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function toShortDate(date: Date): string {
  return `${shortMonths[date.getMonth()]} ${pad(date.getDate())}`;
}

export function isoToLongDate(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return '';
  return `${shortMonths[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

export function isoToShortDate(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return '';
  return `${shortMonths[parts.month - 1]} ${pad(parts.day)}`;
}

export function parseDisplayDate(value: string): Date | null {
  const parts = value.split('/').map((part) => Number(part));
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  if (year < 1900 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function isValidBirthdate(value: string): boolean {
  const date = parseDisplayDate(value);
  if (!date) return false;
  return date.getTime() <= Date.now();
}

export function toIsoDate(value: string): string {
  const date = parseDisplayDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoToDisplayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

export function toDisplayDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function isValidMobile(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return /^\+?[0-9][0-9\s()\-+]{5,20}$/.test(trimmed);
}