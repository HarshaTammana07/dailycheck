import type { Weekday } from '../types';

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayKey() {
  return toDateKey(new Date());
}

export function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function shiftMonth(monthKey: string, delta: number) {
  const start = startOfMonth(monthKey);
  start.setMonth(start.getMonth() + delta);
  return monthKeyFromDate(start);
}

export function daysInMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function getWeekday(dateKey: string): Weekday {
  return parseDateKey(dateKey).getDay() as Weekday;
}

export function formatMonth(monthKey: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(startOfMonth(monthKey));
}

export function formatShortDate(dateKey: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(parseDateKey(dateKey));
}

export function compareDateKeys(a: string, b: string) {
  return a.localeCompare(b);
}

export function addHours(date: Date, hours: number) {
  const copy = new Date(date);
  copy.setHours(copy.getHours() + hours);
  return copy;
}
