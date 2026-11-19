import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT } from '../defaults';
import { completeRetiredScore, validateCompletedSet, validateMatchScore, walkoverScore } from '../format';
import type { MatchFormat } from '../types';

const F = DEFAULT_FORMAT;
const STB: MatchFormat = { ...F, decidingSet: 'super_tiebreak' };
const PRO: MatchFormat = { ...F, bestOf: 1, gamesPerSet: 9, tiebreakAt: 8 };

describe('Validación de sets', () => {
  it.each([
    [6, 0],
    [6, 4],
    [7, 5],
    [7, 6],
    [4, 6],
    [6, 7],
  ])('acepta %i-%i', (a, b) => expect(() => validateCompletedSet({ games1: a, games2: b }, F, 1)).not.toThrow());

  it.each([
    [6, 5],
    [6, 6],
    [8, 6],
    [7, 3],
    [5, 3],
    [-1, 6],
  ])('rechaza %i-%i', (a, b) => expect(() => validateCompletedSet({ games1: a, games2: b }, F, 1)).toThrow());

  it('valida puntos de tie-break', () => {
    expect(() => validateCompletedSet({ games1: 7, games2: 6, tiebreak1: 7, tiebreak2: 5 }, F, 1)).not.toThrow();
    expect(() => validateCompletedSet({ games1: 7, games2: 6, tiebreak1: 10, tiebreak2: 8 }, F, 1)).not.toThrow();
    expect(() => validateCompletedSet({ games1: 7, games2: 6, tiebreak1: 5, tiebreak2: 7 }, F, 1)).toThrow();
    expect(() => validateCompletedSet({ games1: 7, games2: 6, tiebreak1: 7, tiebreak2: 6 }, F, 1)).toThrow();
  });

  it('set largo a 9 con tie-break en 8-8', () => {
    expect(() => validateCompletedSet({ games1: 9, games2: 7 }, PRO, 1)).not.toThrow();
    expect(() => validateCompletedSet({ games1: 9, games2: 8 }, PRO, 1)).not.toThrow();
    expect(() => validateCompletedSet({ games1: 10, games2: 8 }, PRO, 1)).toThrow();
  });
});

describe('Validación de partidos', () => {
  it('mejor de 3: detecta ganador', () => {
    expect(validateMatchScore([{ games1: 6, games2: 3 }, { games1: 6, games2: 4 }], F)).toBe(1);
    expect(validateMatchScore([{ games1: 6, games2: 3 }, { games1: 3, games2: 6 }, { games1: 5, games2: 7 }], F)).toBe(2);
  });
  it('rechaza resultados incompletos o con sets sobrantes', () => {
    expect(() => validateMatchScore([{ games1: 6, games2: 3 }], F)).toThrow(/incompleto/);
    expect(() => validateMatchScore([{ games1: 6, games2: 3 }, { games1: 6, games2: 3 }, { games1: 6, games2: 3 }], F)).toThrow(/Sobra/);
  });
  it('super tie-break en el set decisivo', () => {
    expect(
      validateMatchScore([{ games1: 6, games2: 3 }, { games1: 3, games2: 6 }, { games1: 0, games2: 0, tiebreak1: 10, tiebreak2: 8 }], STB),
    ).toBe(1);
    expect(() =>
      validateMatchScore([{ games1: 6, games2: 3 }, { games1: 3, games2: 6 }, { games1: 0, games2: 0, tiebreak1: 10, tiebreak2: 9 }], STB),
    ).toThrow();
  });
});

describe('W.O. y abandono', () => {
  it('W.O. otorga el marcador máximo', () => {
    expect(walkoverScore(1, F)).toEqual([
      { games1: 6, games2: 0, isSuperTiebreak: false },
      { games1: 6, games2: 0, isSuperTiebreak: false },
    ]);
  });
  it('abandono completa el set en curso y los restantes a favor del ganador', () => {
    const full = completeRetiredScore([{ games1: 6, games2: 4 }, { games1: 2, games2: 3 }], 2, F);
    expect(full.map((x) => [x.games1, x.games2])).toEqual([
      [6, 4],
      [2, 6],
      [0, 6],
    ]);
  });
  it('abandono con 5-6 se completa 5-7 y con 6-6 se completa 6-7', () => {
    expect(completeRetiredScore([{ games1: 5, games2: 6 }], 2, F)[0]).toMatchObject({ games1: 5, games2: 7 });
    expect(completeRetiredScore([{ games1: 6, games2: 6 }], 2, F)[0]).toMatchObject({ games1: 6, games2: 7 });
  });
  it('rechaza un abandono si la pareja que se retira ya había ganado', () => {
    expect(() => completeRetiredScore([{ games1: 6, games2: 1 }, { games1: 6, games2: 1 }], 2, F)).toThrow();
  });
});
