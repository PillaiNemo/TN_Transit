import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { City } from '../types';

// Cities rarely change during a visit, so the GET /api/cities response is shared.
let cache: Promise<City[]> | null = null;

export function useCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cache ??= api.get<City[]>('/cities');
    cache.then(setCities).catch((e) => {
      cache = null;
      setError(e.message);
    });
  }, []);
  return { cities, error };
}
