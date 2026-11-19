import { Copy, Download, FileDown, Monitor, Printer, QrCode, Trophy } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useRef, useState } from 'react';
import { SectionTitle } from '@/components/ui';
import { publicBaseUrl, repo } from '@/data';
import { useToast } from '@/hooks/useToast';
import { useTournament } from '@/hooks/useTournament';
import { exportPdf, exportResultsCsv, exportStandingsCsv } from '@/lib/export';

export default function ShareAdmin() {
  const { snapshot: s } = useTournament();
  const toast = useToast();
  const qrRef = useRef<HTMLDivElement>(null);
  const [interval, setIntervalSec] = useState(s.tournament.settings.display.tvIntervalSeconds);
  const base = publicBaseUrl();
  const publicUrl = `${base}/t/${s.tournament.slug}`;
  const tvUrl = `${publicUrl}/tv?intervalo=${interval}`;
  const awardsUrl = `${publicUrl}/premiacion`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar; selecciona el texto manualmente.');
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-${s.tournament.slug}.png`;
    a.click();
  };

  const LinkRow = ({ label, url, icon: Icon }: { label: string; url: string; icon: typeof Copy }) => (
    <div>
      <div className="label">{label}</div>
      <div className="flex gap-2">
        <input readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.target.select()} />
        <button className="btn-secondary btn-sm" onClick={() => copy(url)} aria-label={`Copiar ${label}`}>
          <Copy className="h-4 w-4" />
        </button>
        <a className="btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir ${label}`}>
          <Icon className="h-4 w-4" />
        </a>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {repo.mode === 'local' && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200/90">
          Modo local: estos enlaces solo muestran datos en este mismo navegador. Para compartirlos con móviles y otros equipos, configura Supabase y despliega la app (ver README).
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card space-y-4 p-5 sm:p-6">
          <SectionTitle eyebrow="Sin registro, solo lectura">Enlaces públicos</SectionTitle>
          <LinkRow label="Dashboard público" url={publicUrl} icon={QrCode} />
          <div>
            <LinkRow label="Modo TV / proyector" url={tvUrl} icon={Monitor} />
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              Rotación cada
              <input type="number" min={5} className="input w-20 py-1 text-xs" value={interval} onChange={(e) => setIntervalSec(Math.max(5, Number(e.target.value)))} />
              segundos · Teclas: ← → cambiar, espacio pausar, F pantalla completa.
            </div>
          </div>
          <LinkRow label="Resumen final y premiación" url={awardsUrl} icon={Trophy} />
        </section>
        <section className="card flex flex-col items-center p-5 text-center">
          <div ref={qrRef} className="rounded-2xl bg-white p-4">
            <QRCodeCanvas value={publicUrl} size={220} marginSize={1} />
          </div>
          <p className="mt-3 text-sm text-slate-300">Escanea para seguir el torneo en vivo</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-secondary btn-sm" onClick={downloadQr}>
              <Download className="h-4 w-4" /> PNG
            </button>
            <button className="btn-secondary btn-sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>
        </section>
      </div>

      <section className="card p-5 sm:p-6">
        <SectionTitle eyebrow="Informes">Exportar</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void exportPdf(s)}>
            <FileDown className="h-4 w-4" /> Clasificaciones y resultados (PDF)
          </button>
          <button className="btn-secondary" onClick={() => exportStandingsCsv(s)}>
            <FileDown className="h-4 w-4" /> Clasificaciones (CSV)
          </button>
          <button className="btn-secondary" onClick={() => exportResultsCsv(s)}>
            <FileDown className="h-4 w-4" /> Resultados (CSV)
          </button>
        </div>
      </section>
    </div>
  );
}
