import { useState } from 'react';
import { ResourceManager, type FormValues } from '../../components/admin/ResourceManager';
import { Badge } from '../../components/ui';
import { useLookups } from '../../hooks/useLookups';
import { formatDuration } from '../../lib/format';
import { AdminHeader } from '../../layouts/AdminLayout';

const MODE_OPTIONS = [{ value: 'BUS', label: 'Bus' }, { value: 'TRAIN', label: 'Train' }];
const BUS_TYPES = ['Ordinary', 'Express', 'AC Seater', 'AC Sleeper', 'Non-AC Sleeper'];
const TRAIN_TYPES = ['Superfast', 'Mail/Express', 'Intercity'];

const ModeBadge = ({ mode }: { mode: unknown }) => <Badge tone={mode === 'BUS' ? 'amber' : 'navy'}>{mode === 'BUS' ? 'Bus' : 'Train'}</Badge>;
const Active = ({ on }: { on: unknown }) => (on ? <Badge tone="teal">Active</Badge> : <Badge tone="gray">Inactive</Badge>);
const n = (v: unknown) => Number(v ?? 0);

export function CitiesStationsPage() {
  const [tab, setTab] = useState<'cities' | 'stations'>('cities');
  const { lookups, refresh } = useLookups();
  return (
    <>
      <AdminHeader title="Cities & stations" description="A city has many stations (1:N). Station type must match the services that use it." />
      <div className="mb-5 inline-flex rounded bg-paper-100 p-1">
        {(['cities', 'stations'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-ink-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'cities' ? (
        <ResourceManager endpoint="/admin/cities" idKey="city_id" noun="City" searchPlaceholder="Search cities" onSaved={refresh}
          defaults={{ state: 'Tamil Nadu' }}
          deleteHint="A city that still has stations cannot be deleted (foreign key stations.city_id → cities, ON DELETE RESTRICT)."
          columns={[
            { key: 'city_name', label: 'City', render: (r) => <span className="font-semibold">{String(r.city_name)}</span> },
            { key: 'also_known_as', label: 'Also known as' },
            { key: 'state', label: 'State' },
            { key: 'station_count', label: 'Stations', className: 'text-right' },
          ]}
          fields={[
            { name: 'city_name', label: 'City name', type: 'text', required: true, maxLength: 60 },
            { name: 'also_known_as', label: 'Also known as', type: 'text', maxLength: 40, placeholder: 'e.g. Trichy' },
            { name: 'state', label: 'State', type: 'text', required: true, maxLength: 60 },
          ]} />
      ) : (
        <ResourceManager endpoint="/admin/stations" idKey="station_id" noun="Station" searchPlaceholder="Name, code or city" onSaved={refresh}
          filters={[{ name: 'kind', label: 'Type', options: MODE_OPTIONS }]}
          deleteHint="Stations used by a route cannot be deleted (routes reference them with ON DELETE RESTRICT)."
          columns={[
            { key: 'station_name', label: 'Station', render: (r) => <span className="font-semibold">{String(r.station_name)}</span> },
            { key: 'station_code', label: 'Code', render: (r) => <span className="font-mono text-xs">{String(r.station_code)}</span> },
            { key: 'city_name', label: 'City' },
            { key: 'station_kind', label: 'Type', render: (r) => <ModeBadge mode={r.station_kind} /> },
            { key: 'route_count', label: 'Routes', className: 'text-right' },
          ]}
          fields={[
            { name: 'station_name', label: 'Station name', type: 'text', required: true, maxLength: 100, wide: true },
            { name: 'station_code', label: 'Station code', type: 'text', required: true, maxLength: 12, hint: 'A–Z, 0–9, hyphen',
              validate: (v) => (/^[A-Za-z0-9-]{2,12}$/.test(String(v)) ? null : '2–12 letters, digits or hyphens') },
            { name: 'station_kind', label: 'Type', type: 'select', required: true, options: MODE_OPTIONS },
            { name: 'city_id', label: 'City', type: 'select', required: true, options: lookups.cities.map((c) => ({ value: c.city_id, label: c.city_name })) },
          ]} />
      )}
    </>
  );
}

export function RoutesPage() {
  const { lookups, refresh } = useLookups();
  const stationOptions = (f: FormValues) => lookups.stations
    .filter((s) => !f.transport_mode || s.station_kind === f.transport_mode)
    .map((s) => ({ value: s.station_id, label: `${s.city_name} — ${s.station_name} (${s.station_code})` }));
  return (
    <>
      <AdminHeader title="Routes" description="Ordered station pairs. CHECK constraint routes_distinct_ends forbids identical origin and destination; UNIQUE(origin, destination) prevents duplicates." />
      <ResourceManager endpoint="/admin/routes" idKey="route_id" noun="Route" searchPlaceholder="City or station" onSaved={refresh}
        filters={[{ name: 'mode', label: 'Mode', options: MODE_OPTIONS }]}
        toForm={(r) => ({ ...r, transport_mode: String(r.transport_mode) } as FormValues)}
        toPayload={({ transport_mode: _ignored, ...rest }) => rest}
        columns={[
          { key: 'route', label: 'Route', render: (r) => (
            <div><p className="font-semibold">{String(r.origin_city)} → {String(r.destination_city)}</p>
              <p className="text-xs text-ink-400">{String(r.origin_station)} → {String(r.destination_station)}</p></div>) },
          { key: 'transport_mode', label: 'Mode', render: (r) => <ModeBadge mode={r.transport_mode} /> },
          { key: 'distance_km', label: 'Distance', render: (r) => `${n(r.distance_km)} km` },
          { key: 'duration_minutes', label: 'Est. duration', render: (r) => formatDuration(n(r.duration_minutes)) },
          { key: 'service_count', label: 'Services', className: 'text-right' },
        ]}
        fields={[
          { name: 'transport_mode', label: 'Mode (filters stations)', type: 'select', options: MODE_OPTIONS, wide: true },
          { name: 'origin_station_id', label: 'Origin station', type: 'select', required: true, options: stationOptions, wide: true },
          { name: 'destination_station_id', label: 'Destination station', type: 'select', required: true, options: stationOptions, wide: true,
            validate: (v, f) => (String(v) === String(f.origin_station_id) ? 'Destination must differ from origin' : null) },
          { name: 'distance_km', label: 'Distance (km)', type: 'number', required: true, min: 1, max: 5000, step: 0.1 },
          { name: 'duration_minutes', label: 'Estimated duration (minutes)', type: 'number', required: true, min: 10, max: 2879 },
        ]} />
    </>
  );
}

export function OperatorsPage() {
  return (
    <>
      <AdminHeader title="Operators" description="Bus companies and railway service operators (fictional). An operator's mode cannot change once it owns vehicles." />
      <ResourceManager endpoint="/admin/operators" idKey="operator_id" noun="Operator" searchPlaceholder="Operator name"
        filters={[{ name: 'mode', label: 'Mode', options: MODE_OPTIONS }]}
        defaults={{ is_active: true }}
        columns={[
          { key: 'operator_name', label: 'Operator', render: (r) => <span className="font-semibold">{String(r.operator_name)}</span> },
          { key: 'transport_mode', label: 'Mode', render: (r) => <ModeBadge mode={r.transport_mode} /> },
          { key: 'contact_phone', label: 'Contact' },
          { key: 'vehicle_count', label: 'Vehicles', className: 'text-right' },
          { key: 'is_active', label: 'Status', render: (r) => <Active on={r.is_active} /> },
        ]}
        fields={[
          { name: 'operator_name', label: 'Operator name', type: 'text', required: true, maxLength: 100, wide: true },
          { name: 'transport_mode', label: 'Transport mode', type: 'select', required: true, options: MODE_OPTIONS },
          { name: 'contact_phone', label: 'Contact phone', type: 'text', maxLength: 15 },
          { name: 'is_active', label: 'Status', type: 'checkbox', placeholder: 'Active (inactive operators disappear from search)' },
        ]} />
    </>
  );
}

export function VehiclesPage() {
  const { lookups, refresh } = useLookups();
  return (
    <>
      <AdminHeader title="Buses & trains" description="Physical vehicles. Seats are configured per coach on the Seats & coaches page; capacity is the upper limit enforced by add_coach()." />
      <ResourceManager endpoint="/admin/vehicles" idKey="vehicle_id" noun="Vehicle" searchPlaceholder="Name, number or operator" onSaved={refresh}
        filters={[{ name: 'mode', label: 'Mode', options: MODE_OPTIONS }]}
        defaults={{ is_active: true }}
        deleteHint="Vehicles assigned to a service, or with coaches configured, cannot be deleted. Mark them inactive instead."
        columns={[
          { key: 'vehicle_number', label: 'Number', render: (r) => <span className="font-mono text-xs font-semibold">{String(r.vehicle_number)}</span> },
          { key: 'vehicle_name', label: 'Vehicle', render: (r) => <div><p className="font-semibold">{String(r.vehicle_name)}</p><p className="text-xs text-ink-400">{String(r.vehicle_type)}</p></div> },
          { key: 'operator_name', label: 'Operator', render: (r) => <div><p>{String(r.operator_name)}</p><ModeBadge mode={r.transport_mode} /></div> },
          { key: 'seats', label: 'Seats / capacity', render: (r) => `${n(r.configured_seats)} / ${n(r.capacity)} (${n(r.coach_count)} coach${n(r.coach_count) === 1 ? '' : 'es'})` },
          { key: 'services', label: 'Services', render: (r) => <span className="text-xs">{String(r.services ?? '—')}</span> },
          { key: 'is_active', label: 'Status', render: (r) => <Active on={r.is_active} /> },
        ]}
        fields={[
          { name: 'operator_id', label: 'Operator', type: 'select', required: true, wide: true,
            options: lookups.operators.map((o) => ({ value: o.operator_id, label: `${o.operator_name} (${o.transport_mode})` })) },
          { name: 'vehicle_name', label: 'Vehicle name', type: 'text', required: true, maxLength: 100 },
          { name: 'vehicle_number', label: 'Registration / rake number', type: 'text', required: true, maxLength: 20 },
          { name: 'vehicle_type', label: 'Body / rake type', type: 'text', required: true, maxLength: 40, placeholder: 'e.g. Multi-axle AC Sleeper, LHB Rake' },
          { name: 'capacity', label: 'Capacity (max seats)', type: 'number', required: true, min: 1, max: 2000 },
          { name: 'is_active', label: 'Status', type: 'checkbox', placeholder: 'Active' },
        ]} />
    </>
  );
}

export function ServicesPage() {
  const { lookups, refresh } = useLookups();
  const modeOf = (f: FormValues) => (f.transport_mode as string) || lookups.vehicles.find((v) => String(v.vehicle_id) === String(f.vehicle_id))?.transport_mode;
  return (
    <>
      <AdminHeader title="Services" description="Bus and railway services: a vehicle running a route under a number. Amenities are a many-to-many relationship (service_amenities)." />
      <ResourceManager endpoint="/admin/services" idKey="service_id" noun="Service" searchPlaceholder="Number, name or city" onSaved={refresh}
        filters={[{ name: 'mode', label: 'Mode', options: MODE_OPTIONS }]}
        defaults={{ is_active: true, amenity_ids: [] }}
        toForm={(r) => ({ ...r, transport_mode: String(r.transport_mode) } as FormValues)}
        toPayload={({ transport_mode: _ignored, ...rest }) => rest}
        deleteHint="Services that have ever been scheduled cannot be deleted (schedules.service_id is ON DELETE RESTRICT). Deactivate instead — it disappears from search but history stays intact."
        columns={[
          { key: 'service_number', label: 'Service', render: (r) => <div><p className="font-semibold">{String(r.service_name)}</p><p className="font-mono text-xs text-ink-400">#{String(r.service_number)}</p></div> },
          { key: 'route', label: 'Route', render: (r) => <div><p>{String(r.origin_city)} → {String(r.destination_city)}</p><p className="text-xs text-ink-400">{String(r.operator_name)} · {String(r.vehicle_number)}</p></div> },
          { key: 'service_type', label: 'Type', render: (r) => <div className="space-y-1"><ModeBadge mode={r.transport_mode} /><p className="text-xs">{String(r.service_type)}</p></div> },
          { key: 'fare_count', label: 'Fares', render: (r) => (n(r.fare_count) ? `${n(r.fare_count)} class${n(r.fare_count) > 1 ? 'es' : ''}` : <Badge tone="rose">None — not on sale</Badge>) },
          { key: 'upcoming_schedules', label: 'Upcoming runs', className: 'text-right' },
          { key: 'is_active', label: 'Status', render: (r) => <Active on={r.is_active} /> },
        ]}
        fields={[
          { name: 'transport_mode', label: 'Mode (filters the lists below)', type: 'select', options: MODE_OPTIONS, wide: true },
          { name: 'service_number', label: 'Service number', type: 'text', required: true, maxLength: 12, placeholder: 'e.g. 96301 or TNT-B301' },
          { name: 'service_name', label: 'Service name', type: 'text', required: true, maxLength: 100 },
          { name: 'vehicle_id', label: 'Vehicle', type: 'select', required: true, wide: true,
            options: (f) => lookups.vehicles.filter((v) => !f.transport_mode || v.transport_mode === f.transport_mode)
              .map((v) => ({ value: v.vehicle_id, label: `${v.vehicle_number} — ${v.vehicle_name}` })) },
          { name: 'route_id', label: 'Route', type: 'select', required: true, wide: true,
            options: (f) => lookups.routes.filter((r) => !modeOf(f) || r.transport_mode === modeOf(f)).map((r) => ({ value: r.route_id, label: r.label })) },
          { name: 'service_type', label: 'Service type', type: 'select', required: true,
            options: (f) => (modeOf(f) === 'TRAIN' ? TRAIN_TYPES : modeOf(f) === 'BUS' ? BUS_TYPES : [...BUS_TYPES, ...TRAIN_TYPES]).map((t) => ({ value: t, label: t })) },
          { name: 'is_active', label: 'Status', type: 'checkbox', placeholder: 'Active (shown in search)' },
          { name: 'amenity_ids', label: 'Amenities', type: 'multiselect', options: lookups.amenities.map((a) => ({ value: a.amenity_id, label: a.amenity_name })) },
        ]} />
    </>
  );
}
