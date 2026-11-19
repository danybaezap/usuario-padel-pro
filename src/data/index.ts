import { LocalRepository } from './localRepo';
import type { Repository } from './repository';
import { SupabaseRepository } from './supabaseRepo';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const repo: Repository = url && key ? new SupabaseRepository(url, key) : new LocalRepository();

export function publicBaseUrl(): string {
  const env = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.replace(/\/$/, '');
  return env || window.location.origin;
}

export * from './repository';
