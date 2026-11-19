import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { repo } from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { BrandMark } from './Home';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const next = params.get('next') || '/';

  if (repo.mode === 'local')
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <BrandMark />
        <p className="mt-6 text-slate-300">En modo local no hay cuentas: cada torneo se protege con su PIN de administración.</p>
        <Link to="/" className="btn-secondary mt-4">
          Volver
        </Link>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'in') await repo.signIn(email, password);
      else await repo.signUp(email, password);
      toast.success('Sesión iniciada');
      nav(next);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <BrandMark />
        <h1 className="display mt-6 text-2xl text-white">{mode === 'in' ? 'Acceso organizador' : 'Crear cuenta de organizador'}</h1>
        {user && <p className="mt-2 text-xs text-slate-400">Sesión actual: {user.email}</p>}
        <div className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="email">
              Correo
            </label>
            <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="pw">
              Contraseña
            </label>
            <input id="pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Procesando…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </div>
        <button type="button" className="btn-ghost btn-sm mt-4 w-full" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? '¿Primera vez? Crear cuenta' : 'Ya tengo cuenta'}
        </button>
        <Link to="/" className="mt-2 block text-center text-xs text-slate-500 hover:text-slate-300">
          Volver al inicio
        </Link>
      </form>
    </div>
  );
}
