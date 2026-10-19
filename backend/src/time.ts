// Utilitários de data/hora. Persistência sempre em UTC; exibição no fuso configurado (America/Sao_Paulo).

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export function formatLocal(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(isoUtc));
}

/** Data (YYYY-MM-DD) no fuso informado. */
export function localDate(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function parts(date: Date, timeZone: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out as { year: string; month: string; day: string; hour: string; minute: string; second: string };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC correspondente a 00:00 do dia local informado. */
export function startOfLocalDayUtc(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let ts = guess - offsetMs(new Date(guess), timeZone);
  ts = guess - offsetMs(new Date(ts), timeZone); // reaplica para cobrir transições de horário de verão
  return new Date(ts);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Intervalo [início, fim) em UTC para dias locais inclusivos `from`..`to`. */
export function localRangeToUtc(from: string | undefined, to: string | undefined, timeZone: string) {
  return {
    fromUtc: from ? startOfLocalDayUtc(from, timeZone).toISOString() : undefined,
    toUtcExclusive: to ? startOfLocalDayUtc(addDays(to, 1), timeZone).toISOString() : undefined,
  };
}
