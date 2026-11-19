import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { repo, type AuthUser } from '@/data';

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
}

const Ctx = createContext<AuthState>({ user: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, ready: false });
  useEffect(() => {
    let alive = true;
    repo.getUser().then((user) => alive && setState({ user, ready: true }));
    const off = repo.onAuthChange((user) => setState({ user, ready: true }));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
