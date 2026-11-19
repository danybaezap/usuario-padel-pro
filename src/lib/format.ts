const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function hhmm(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return timeFmt.format(new Date(d));
}

export function longDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return isNaN(d.getTime()) ? isoDate : dateFmt.format(d);
}

export function elapsed(from: string | null | undefined, now: Date): string {
  if (!from) return '';
  const m = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60000));
  return m < 60 ? `${m}′` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}′`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
