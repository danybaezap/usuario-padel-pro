import { DomainError, type Match, type MatchFormat, type MatchSet } from './types';

/** Entrada de un set tal como la registra el administrador. */
export interface SetInput {
  games1: number;
  games2: number;
  tiebreak1?: number | null;
  tiebreak2?: number | null;
  isSuperTiebreak?: boolean;
}

/** Set "oficial" ya normalizado para estadísticas. */
export interface OfficialSet {
  g1: number;
  g2: number;
  winner: 1 | 2;
  superTiebreak: boolean;
}

export function setsToWin(f: MatchFormat): number {
  return Math.ceil(f.bestOf / 2);
}

/** ¿El set número `setNumber` (1-based) es un super tie-break según el formato? */
export function isSuperTiebreakSet(f: MatchFormat, setNumber: number): boolean {
  return f.decidingSet === 'super_tiebreak' && f.bestOf > 1 && setNumber === f.bestOf;
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

function validTiebreakPoints(w: number, l: number, target: number): boolean {
  if (w < target) return false;
  if (w - l < 2) return false;
  if (w > target && w - l !== 2) return false;
  return true;
}

/**
 * Valida un set completo. Devuelve el ganador (1|2) o lanza DomainError.
 */
export function validateCompletedSet(set: SetInput, f: MatchFormat, setNumber: number): 1 | 2 {
  const label = `Set ${setNumber}`;
  if (isSuperTiebreakSet(f, setNumber)) {
    const p1 = set.tiebreak1 ?? set.games1;
    const p2 = set.tiebreak2 ?? set.games2;
    if (!isInt(p1) || !isInt(p2)) throw new DomainError(`${label}: puntos de super tie-break inválidos.`);
    const w = Math.max(p1, p2);
    const l = Math.min(p1, p2);
    if (!validTiebreakPoints(w, l, f.superTiebreakPoints))
      throw new DomainError(
        `${label}: un super tie-break se gana con ${f.superTiebreakPoints} puntos y 2 de diferencia (ej. ${f.superTiebreakPoints}-${f.superTiebreakPoints - 3}, ${f.superTiebreakPoints + 2}-${f.superTiebreakPoints}).`,
      );
    return p1 > p2 ? 1 : 2;
  }
  const { games1: a, games2: b } = set;
  if (!isInt(a) || !isInt(b)) throw new DomainError(`${label}: los juegos deben ser números enteros.`);
  if (a === b) throw new DomainError(`${label}: no puede terminar empatado (${a}-${b}).`);
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  const G = f.gamesPerSet;
  const T = f.tiebreakAt;
  let ok = false;
  let isTb = false;
  if (w === G && l <= G - 2) ok = true;
  else if (w > G && w - l === 2 && l >= G - 1 && (T === null || l < T)) ok = true;
  else if (T !== null && w === T + 1 && l === T) {
    ok = true;
    isTb = true;
  }
  if (!ok) {
    const examples = T !== null ? `${G}-${G - 2}, ${G + 1}-${G - 1}, ${T + 1}-${T}` : `${G}-${G - 2}, ${G + 1}-${G - 1}, ${G + 2}-${G}`;
    throw new DomainError(`${label}: marcador ${a}-${b} imposible para sets a ${G} juegos (válidos p. ej. ${examples}).`);
  }
  if (isTb && set.tiebreak1 != null && set.tiebreak2 != null) {
    const tw = a > b ? set.tiebreak1 : set.tiebreak2;
    const tl = a > b ? set.tiebreak2 : set.tiebreak1;
    if (!isInt(tw) || !isInt(tl) || !validTiebreakPoints(tw, tl, f.tiebreakPoints))
      throw new DomainError(`${label}: puntos de tie-break incoherentes con el ganador del set.`);
  }
  if (!isTb && (set.tiebreak1 != null || set.tiebreak2 != null) && (set.tiebreak1 || set.tiebreak2))
    throw new DomainError(`${label}: solo se registran puntos de tie-break en un set ${T ?? G}-${T ?? G}.`);
  return a > b ? 1 : 2;
}

/**
 * Valida un resultado completo (partido terminado normalmente).
 * Devuelve el ganador.
 */
export function validateMatchScore(sets: SetInput[], f: MatchFormat): 1 | 2 {
  if (!sets.length) throw new DomainError('Introduce al menos un set.');
  if (sets.length > f.bestOf) throw new DomainError(`El formato es al mejor de ${f.bestOf} sets.`);
  const need = setsToWin(f);
  let s1 = 0;
  let s2 = 0;
  sets.forEach((set, i) => {
    if (s1 === need || s2 === need)
      throw new DomainError(`Sobra el set ${i + 1}: el partido ya estaba decidido.`);
    const w = validateCompletedSet(set, f, i + 1);
    if (w === 1) s1++;
    else s2++;
  });
  if (s1 !== need && s2 !== need)
    throw new DomainError(`Resultado incompleto: una pareja debe ganar ${need} set${need > 1 ? 's' : ''}.`);
  return s1 === need ? 1 : 2;
}

/** ¿Un set parcial (sin terminar) es plausible? */
function validatePartialSet(set: SetInput, f: MatchFormat, setNumber: number): void {
  const label = `Set ${setNumber}`;
  if (isSuperTiebreakSet(f, setNumber)) {
    const p1 = set.tiebreak1 ?? set.games1;
    const p2 = set.tiebreak2 ?? set.games2;
    if (!isInt(p1) || !isInt(p2)) throw new DomainError(`${label}: puntos inválidos.`);
    const w = Math.max(p1, p2);
    const l = Math.min(p1, p2);
    if (validTiebreakPoints(w, l, f.superTiebreakPoints))
      throw new DomainError(`${label}: ese super tie-break ya estaba terminado.`);
    if (w > f.superTiebreakPoints && w - l > 1) throw new DomainError(`${label}: marcador parcial imposible.`);
    return;
  }
  const { games1: a, games2: b } = set;
  if (!isInt(a) || !isInt(b)) throw new DomainError(`${label}: juegos inválidos.`);
  const G = f.gamesPerSet;
  const T = f.tiebreakAt;
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  const completed = (() => {
    try {
      validateCompletedSet({ games1: a, games2: b }, f, setNumber);
      return true;
    } catch {
      return false;
    }
  })();
  if (completed) throw new DomainError(`${label}: ese set ya estaba terminado; el abandono fue en el siguiente.`);
  const max = T !== null ? T : Infinity;
  if (w > Math.max(G, max) || (w >= G && w - l >= 2)) throw new DomainError(`${label}: marcador parcial imposible (${a}-${b}).`);
}

/**
 * Completa un resultado por abandono a favor del ganador:
 * se conservan los juegos reales y se otorgan los necesarios para
 * cerrar el set en curso y los sets restantes.
 */
export function completeRetiredScore(played: SetInput[], winner: 1 | 2, f: MatchFormat): SetInput[] {
  const need = setsToWin(f);
  const result: SetInput[] = [];
  let s1 = 0;
  let s2 = 0;
  played.forEach((set, i) => {
    const n = i + 1;
    let isComplete = false;
    try {
      const w = validateCompletedSet(set, f, n);
      isComplete = true;
      result.push({ ...set, isSuperTiebreak: isSuperTiebreakSet(f, n) });
      if (w === 1) s1++;
      else s2++;
    } catch {
      /* set incompleto */
    }
    if (!isComplete) {
      if (i !== played.length - 1) throw new DomainError(`Set ${n}: solo el último set puede estar incompleto.`);
      validatePartialSet(set, f, n);
      result.push(completeSet(set, winner, f, n));
      if (winner === 1) s1++;
      else s2++;
    }
  });
  if ((winner === 1 ? s2 : s1) >= need)
    throw new DomainError('Con ese marcador la pareja que abandona ya había ganado el partido.');
  while ((winner === 1 ? s1 : s2) < need) {
    const n = result.length + 1;
    result.push(completeSet({ games1: 0, games2: 0 }, winner, f, n));
    if (winner === 1) s1++;
    else s2++;
  }
  return result;
}

function completeSet(set: SetInput, winner: 1 | 2, f: MatchFormat, setNumber: number): SetInput {
  if (isSuperTiebreakSet(f, setNumber)) {
    const p1 = set.tiebreak1 ?? set.games1 ?? 0;
    const p2 = set.tiebreak2 ?? set.games2 ?? 0;
    const loser = winner === 1 ? p2 : p1;
    const wp = Math.max(f.superTiebreakPoints, loser + 2);
    return {
      games1: winner === 1 ? 1 : 0,
      games2: winner === 1 ? 0 : 1,
      tiebreak1: winner === 1 ? wp : loser,
      tiebreak2: winner === 1 ? loser : wp,
      isSuperTiebreak: true,
    };
  }
  const G = f.gamesPerSet;
  const T = f.tiebreakAt;
  const loserGames = winner === 1 ? set.games2 : set.games1;
  let wg: number;
  if (loserGames <= G - 2) wg = G;
  else if (T !== null && loserGames >= T) wg = T + 1; // tie-break
  else wg = loserGames + 2;
  return winner === 1
    ? { games1: wg, games2: loserGames, isSuperTiebreak: false }
    : { games1: loserGames, games2: wg, isSuperTiebreak: false };
}

/** Marcador de W.O.: máximo del formato para el ganador. */
export function walkoverScore(winner: 1 | 2, f: MatchFormat): SetInput[] {
  return completeRetiredScore([], winner, f);
}

/**
 * Convierte los sets guardados de un partido finalizado en sets oficiales
 * para estadísticas, aplicando las reglas de W.O. y abandono.
 */
export function officialSets(match: Match, sets: MatchSet[], f: MatchFormat): OfficialSet[] {
  if (match.status !== 'finished' || !match.winnerPairId) return [];
  const winner: 1 | 2 = match.winnerPairId === match.pair1Id ? 1 : 2;
  const ordered = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  let inputs: SetInput[];
  if (match.outcome === 'walkover') inputs = walkoverScore(winner, f);
  else if (match.outcome === 'retired') inputs = completeRetiredScore(ordered.map(toInput), winner, f);
  else inputs = ordered.map(toInput);
  return inputs.map((s, i) => {
    const superTb = !!s.isSuperTiebreak || isSuperTiebreakSet(f, i + 1);
    let w: 1 | 2;
    if (superTb) {
      const p1 = s.tiebreak1 ?? s.games1;
      const p2 = s.tiebreak2 ?? s.games2;
      w = p1 > p2 ? 1 : 2;
      const counts = f.superTiebreakCountsAs === 'one_game';
      return { g1: counts && w === 1 ? 1 : 0, g2: counts && w === 2 ? 1 : 0, winner: w, superTiebreak: true };
    }
    w = s.games1 > s.games2 ? 1 : 2;
    return { g1: s.games1, g2: s.games2, winner: w, superTiebreak: false };
  });
}

export function toInput(s: MatchSet): SetInput {
  return {
    games1: s.games1,
    games2: s.games2,
    tiebreak1: s.tiebreak1,
    tiebreak2: s.tiebreak2,
    isSuperTiebreak: s.isSuperTiebreak,
  };
}

/** Texto del marcador desde la perspectiva de la pareja 1, p. ej. "6-4 7-6(5)". */
export function scoreText(sets: (MatchSet | SetInput)[]): string {
  return [...sets]
    .sort((a, b) => ('setNumber' in a && 'setNumber' in b ? a.setNumber - b.setNumber : 0))
    .map((s) => {
      if (s.isSuperTiebreak) return `[${s.tiebreak1 ?? s.games1}-${s.tiebreak2 ?? s.games2}]`;
      const tb =
        s.tiebreak1 != null && s.tiebreak2 != null && (s.tiebreak1 || s.tiebreak2)
          ? `(${Math.min(s.tiebreak1, s.tiebreak2)})`
          : '';
      return `${s.games1}-${s.games2}${tb}`;
    })
    .join(' ');
}

export function formatDescription(f: MatchFormat): string {
  const sets = f.bestOf === 1 ? '1 set' : `Mejor de ${f.bestOf} sets`;
  const tb = f.tiebreakAt !== null ? `tie-break en ${f.tiebreakAt}-${f.tiebreakAt}` : 'sin tie-break (dif. 2)';
  const dec = f.bestOf > 1 && f.decidingSet === 'super_tiebreak' ? ` · decisivo: super tie-break a ${f.superTiebreakPoints}` : '';
  const gp = f.goldenPoint ? ' · punto de oro' : ' · con ventaja';
  return `${sets} a ${f.gamesPerSet} juegos · ${tb}${dec}${gp}`;
}
