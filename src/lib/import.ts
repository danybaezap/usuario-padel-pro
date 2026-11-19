import type { ImportRow } from '@/domain/commands';
import { normalizeName } from '@/domain/util';

/**
 * Lee un CSV o Excel (.xlsx) con columnas Jugador 1, Jugador 2 y Categoría.
 * Acepta cabeceras en español o inglés, o tres columnas sin cabecera.
 */
export async function parsePairsFile(file: File): Promise<ImportRow[]> {
  let table: string[][];
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsx } = await import('read-excel-file');
    const rows = await readXlsx(file);
    table = rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
  } else if (/\.(csv|txt)$/i.test(file.name)) {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();
    const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true });
    table = res.data;
  } else {
    throw new Error('Formato no soportado. Usa .csv o .xlsx (para .xls, guárdalo como .xlsx).');
  }
  table = table.filter((r) => r.some((c) => String(c).trim()));
  if (!table.length) throw new Error('El archivo está vacío.');

  const header = table[0].map((h) => normalizeName(String(h)));
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h === k || h.replace(/ /g, '') === k.replace(/ /g, '')));
  let i1 = find('jugador 1', 'jugador1', 'player 1', 'player1', 'j1', 'nombre 1');
  let i2 = find('jugador 2', 'jugador2', 'player 2', 'player2', 'j2', 'nombre 2');
  let ic = find('categoria', 'category', 'cat');
  let body = table.slice(1);
  if (i1 < 0 || i2 < 0 || ic < 0) {
    // Sin cabecera reconocible: se asume Jugador 1, Jugador 2, Categoría.
    if (table[0].length < 3) throw new Error('Se necesitan 3 columnas: Jugador 1, Jugador 2, Categoría.');
    [i1, i2, ic] = [0, 1, 2];
    const looksLikeHeader = header.some((h) => h.includes('jugador') || h.includes('categoria') || h.includes('player'));
    body = looksLikeHeader ? table.slice(1) : table;
  }
  return body.map((r) => ({ player1: String(r[i1] ?? ''), player2: String(r[i2] ?? ''), category: String(r[ic] ?? '') }));
}

export const TEMPLATE_CSV = '﻿Jugador 1,Jugador 2,Categoría\nAna Pérez,Laura Gómez,A\nCarlos Ruiz,Pedro Sanz,B\n';
