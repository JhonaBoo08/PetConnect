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

const fullMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
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

export function timestampToFullDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${fullMonths[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
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

export function dateToIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoToFullMonthDay(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return '';
  return `${fullMonths[parts.month - 1]} ${parts.day}`;
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

export function parseTime(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridian = match[3]?.toUpperCase();
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
  if (meridian) {
    if (meridian === 'PM' && hours !== 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function formatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${pad(minutes)} ${meridian}`;
}

export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function timeInputToDisplay(input: string): string {
  const parts = input.split(':').map((part) => Number(part));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return input;
  const [hours24, minutes] = parts;
  if (hours24 < 0 || hours24 > 23 || minutes < 0 || minutes > 59) return input;
  const meridian = hours24 >= 12 ? 'PM' : 'AM';
  let hours = hours24 % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${pad(minutes)} ${meridian}`;
}

export function isValidMobile(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return /^\+?[0-9][0-9\s()\-+]{5,20}$/.test(trimmed);
}