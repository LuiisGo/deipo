import type { Drop, DropOpening, DropStatus, WeeklyTime } from '@/types/drop';

export const DROP_TIME_ZONE = 'America/Guatemala';
const weekdays = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const shortWeekdays = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

export function formatTime24(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new RangeError('Time must use HH:mm (00:00–23:59).');
  return time;
}
export function formatSlot(slot: { startsAt: string; endsAt: string }) {
  return `${formatTime24(slot.startsAt)} — ${formatTime24(slot.endsAt)}`;
}
export function formatWeeklyTime(schedule: WeeklyTime, compact = false) {
  if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) throw new RangeError('Weekday must be 0–6.');
  return `${(compact ? shortWeekdays : weekdays)[schedule.weekday]} ${formatTime24(schedule.time)}`;
}
export function timestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new RangeError('Schedule timestamps require an ISO date, time and explicit UTC offset.');
  return Date.parse(value);
}
export function formatOpening(opening: DropOpening | null, compact = false) {
  if (opening?.ordersOpenAt) {
    const date = new Date(timestamp(opening.ordersOpenAt));
    const weekday = new Intl.DateTimeFormat('es-GT', { weekday: compact ? 'short' : 'long', timeZone: DROP_TIME_ZONE }).format(date).replace('.', '').toUpperCase();
    const time = new Intl.DateTimeFormat('es-GT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: DROP_TIME_ZONE }).format(date);
    return `${weekday} ${time}`;
  }
  return opening?.openingReference ? formatWeeklyTime(opening.openingReference, compact) : 'POR ANUNCIAR';
}
export function openingFor(drop: Drop, status: DropStatus): DropOpening | null {
  return status === 'upcoming' ? drop : drop.nextDropOpening;
}
