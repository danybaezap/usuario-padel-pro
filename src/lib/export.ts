import { computeStandings } from '@/domain/standings';
import { matchScoreLabel } from '@/domain/stats';
import type { TournamentSnapshot } from '@/domain/types';
import { PHASE_LABEL, STATUS_LABEL } from '@/domain/types';
import { indexSnapshot } from '@/domain/util';
import { hhmm, longDate } from './format';

function download(name: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: unknown[][]): string {
  // BOM para que Excel abra correctamente los acentos.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function standingsRows(s: TournamentSnapshot) {
  const idx = indexSnapshot(s);
  const rows: unknown[][] = [['Categoría', 'Pos', 'Pareja #', 'Jugador 1', 'Jugador 2', 'PJ', 'G', 'P', '% Vict', 'Sets G', 'Sets P', 'Juegos F', 'Juegos C', 'Dif', 'Empate pendiente']];
  for (const c of s.categories) {
    for (const r of computeStandings(s, c.id)) {
      const [a, b] = idx.pairPlayers(r.pairId);
      rows.push([c.code, r.position, r.pairNumber, a, b, r.played, r.won, r.lost, r.winPct, r.setsWon, r.setsLost, r.gamesWon, r.gamesLost, r.gameDiff, r.unresolvedTie ? 'Sí' : '']);
    }
  }
  return rows;
}

export function resultsRows(s: TournamentSnapshot) {
  const idx = indexSnapshot(s);
  const cats = new Map(s.categories.map((c) => [c.id, c]));
  const courts = new Map(s.courts.map((c) => [c.id, c]));
  const rows: unknown[][] = [['Categoría', 'Fase', 'Vuelta', 'Jornada', 'Pareja 1', 'Pareja 2', 'Estado', 'Resultado', 'Tipo', 'Ganador', 'Cancha', 'Inicio', 'Fin']];
  for (const m of [...s.matches].sort((a, b) => cats.get(a.categoryId)!.sortIndex - cats.get(b.categoryId)!.sortIndex || a.orderIndex - b.orderIndex)) {
    rows.push([
      cats.get(m.categoryId)?.code,
      PHASE_LABEL[m.phase],
      m.phase === 'round_robin' ? m.leg : '',
      m.phase === 'round_robin' ? m.round : '',
      idx.pairName(m.pair1Id),
      idx.pairName(m.pair2Id),
      STATUS_LABEL[m.status],
      m.status === 'finished' ? matchScoreLabel(s, m) : '',
      m.outcome === 'walkover' ? 'W.O.' : m.outcome === 'retired' ? 'Abandono' : m.outcome === 'normal' ? 'Normal' : '',
      m.winnerPairId ? idx.pairName(m.winnerPairId) : '',
      m.courtId ? courts.get(m.courtId)?.name : '',
      m.startedAt ? hhmm(m.startedAt) : '',
      m.finishedAt ? hhmm(m.finishedAt) : '',
    ]);
  }
  return rows;
}

export function exportStandingsCsv(s: TournamentSnapshot) {
  download(`${s.tournament.slug}-clasificaciones.csv`, toCsv(standingsRows(s)), 'text/csv;charset=utf-8');
}

export function exportResultsCsv(s: TournamentSnapshot) {
  download(`${s.tournament.slug}-resultados.csv`, toCsv(resultsRows(s)), 'text/csv;charset=utf-8');
}

export function exportPairsCsv(s: TournamentSnapshot) {
  const idx = indexSnapshot(s);
  const cats = new Map(s.categories.map((c) => [c.id, c]));
  const rows: unknown[][] = [['Jugador 1', 'Jugador 2', 'Categoría']];
  for (const p of [...s.pairs].sort((a, b) => a.number - b.number)) {
    const [a, b] = idx.pairPlayers(p.id);
    rows.push([a, b, cats.get(p.categoryId)?.code]);
  }
  download(`${s.tournament.slug}-parejas.csv`, toCsv(rows), 'text/csv;charset=utf-8');
}

export async function exportPdf(s: TournamentSnapshot) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const idx = indexSnapshot(s);
  const t = s.tournament;
  const colors: Record<string, [number, number, number]> = { A: [245, 176, 33], B: [34, 211, 238], C: [232, 121, 249] };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(t.name, 40, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${longDate(t.date)}${t.venue ? ' · ' + t.venue : ''} · Generado ${new Date().toLocaleString('es')}`, 40, 68);
  doc.setTextColor(0);
  let y = 90;

  for (const c of s.categories) {
    const st = computeStandings(s, c.id);
    if (!st.length) continue;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...colors[c.code]);
    doc.text(`${c.name}${c.podium.length ? '  —  Campeona: ' + idx.pairName(c.podium[0]) : ''}`, 40, y);
    doc.setTextColor(0);
    autoTable(doc, {
      startY: y + 8,
      head: [['Pos', 'Pareja', 'PJ', 'G', 'P', '%', 'Sets', 'JF', 'JC', 'Dif']],
      body: st.map((r) => [
        `${r.position}${r.unresolvedTie ? '=' : ''}`,
        idx.pairName(r.pairId),
        r.played,
        r.won,
        r.lost,
        r.played ? `${Math.round(r.winPct)}%` : '-',
        `${r.setsWon}-${r.setsLost}`,
        r.gamesWon,
        r.gamesLost,
        r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff,
      ]),
      headStyles: { fillColor: colors[c.code], textColor: 20 },
      styles: { fontSize: 9 },
      columnStyles: { 1: { cellWidth: 300 } },
      margin: { left: 40, right: 40 },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 30;
    if (y > 480) {
      doc.addPage();
      y = 50;
    }
  }

  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Resultados', 40, 50);
  const res = resultsRows(s);
  autoTable(doc, {
    startY: 62,
    head: [['Cat', 'Fase', 'Pareja 1', 'Pareja 2', 'Estado', 'Resultado', 'Cancha']],
    body: res.slice(1).map((r) => [r[0], r[1] === 'Round Robin' ? `V${r[2]} J${r[3]}` : r[1], r[4], r[5], r[6], r[7], r[10]] as string[]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [10, 15, 28] },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${t.slug}-resumen.pdf`);
}
