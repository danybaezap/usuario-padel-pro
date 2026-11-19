import type { Match, Pair, PairMember, Player, TournamentSnapshot } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback RFC4122 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Normaliza nombres para detectar duplicados: minúsculas, sin acentos ni espacios extra. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function slugify(text: string): string {
  return normalizeName(text).replace(/ /g, '-').slice(0, 40) || 'torneo';
}

export function randomSuffix(len = 5): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function minutesBetween(a: string | Date, b: string | Date): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

/** Índices auxiliares para consultas rápidas sobre un snapshot. */
export interface SnapshotIndex {
  playerById: Map<string, Player>;
  pairById: Map<string, Pair>;
  membersByPair: Map<string, PairMember[]>;
  pairName: (pairId: string | null | undefined) => string;
  pairPlayers: (pairId: string) => [string, string];
  matchesByCategory: Map<string, Match[]>;
}

export function indexSnapshot(s: TournamentSnapshot): SnapshotIndex {
  const playerById = new Map(s.players.map((p) => [p.id, p]));
  const pairById = new Map(s.pairs.map((p) => [p.id, p]));
  const membersByPair = new Map<string, PairMember[]>();
  for (const m of s.pairMembers) {
    const list = membersByPair.get(m.pairId) ?? [];
    list.push(m);
    membersByPair.set(m.pairId, list);
  }
  for (const list of membersByPair.values()) list.sort((a, b) => a.slot - b.slot);
  const pairPlayers = (pairId: string): [string, string] => {
    const ms = membersByPair.get(pairId) ?? [];
    const names = ms.map((m) => playerById.get(m.playerId)?.fullName ?? '¿?');
    return [names[0] ?? '¿?', names[1] ?? '¿?'];
  };
  const pairName = (pairId: string | null | undefined) => {
    if (!pairId) return 'Por definir';
    const [a, b] = pairPlayers(pairId);
    return `${a} / ${b}`;
  };
  const matchesByCategory = new Map<string, Match[]>();
  for (const m of s.matches) {
    const list = matchesByCategory.get(m.categoryId) ?? [];
    list.push(m);
    matchesByCategory.set(m.categoryId, list);
  }
  return { playerById, pairById, membersByPair, pairName, pairPlayers, matchesByCategory };
}

export function isActiveOnCourt(m: Match): boolean {
  return m.status === 'scheduled' || m.status === 'in_progress';
}

/** Generador pseudoaleatorio determinista (mulberry32) para sorteos y simulaciones reproducibles. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
