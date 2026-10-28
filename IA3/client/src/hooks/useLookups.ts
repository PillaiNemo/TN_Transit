import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Mode } from '../types';

export interface Lookups {
  cities: { city_id: number; city_name: string }[];
  stations: { station_id: number; station_name: string; station_code: string; station_kind: Mode; city_name: string }[];
  operators: { operator_id: number; operator_name: string; transport_mode: Mode }[];
  vehicles: { vehicle_id: number; vehicle_number: string; vehicle_name: string; transport_mode: Mode }[];
  routes: { route_id: number; transport_mode: Mode; label: string }[];
  services: { service_id: number; service_number: string; service_name: string; transport_mode: Mode }[];
  amenities: { amenity_id: number; amenity_name: string }[];
  seat_classes: { class_code: string; class_name: string; transport_mode: Mode }[];
  layouts: { layout_code: string; layout_name: string; class_code: string; seat_count: number; transport_mode: Mode }[];
}

const EMPTY: Lookups = { cities: [], stations: [], operators: [], vehicles: [], routes: [], services: [], amenities: [], seat_classes: [], layouts: [] };

/** Dropdown options for admin forms, from GET /api/admin/lookups. */
export function useLookups() {
  const [lookups, setLookups] = useState<Lookups>(EMPTY);
  const refresh = useCallback(() => api.get<Lookups>('/admin/lookups').then(setLookups).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);
  return { lookups, refresh };
}
