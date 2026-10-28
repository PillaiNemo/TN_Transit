import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { api, errorMessage } from '../../services/api';
import { Button, EmptyState, ErrorState, Field, Modal, Skeleton } from '../ui';

export type FormValues = Record<string, string | number | boolean | number[] | null>;
type Row = Record<string, unknown>;
export interface Option { value: string | number; label: string }

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'time' | 'datetime' | 'multiselect';
  options?: Option[] | ((form: FormValues) => Option[]);
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  createOnly?: boolean;
  editOnly?: boolean;
  wide?: boolean;
  validate?: (value: FormValues[string], form: FormValues) => string | null;
}

export interface FilterDef { name: string; label: string; options?: Option[]; type?: 'select' | 'date' }
export interface Column { key: string; label: string; render?: (row: Row) => ReactNode; className?: string }

interface Props {
  endpoint: string;
  idKey: string;
  noun: string;
  columns: Column[];
  fields: FieldDef[];
  filters?: FilterDef[];
  searchPlaceholder?: string;
  defaults?: FormValues;
  toForm?: (row: Row) => FormValues;
  toPayload?: (form: FormValues, editing: boolean) => Record<string, unknown>;
  canDelete?: boolean;
  deleteHint?: string;
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  onSaved?: () => void;
  unwrap?: (data: unknown) => Row[];
  createLabel?: string;
  initialFilters?: Record<string, string>;
}

export function ResourceManager({
  endpoint, idKey, noun, columns, fields, filters = [], searchPlaceholder = 'Search…', defaults = {},
  toForm, toPayload, canDelete = true, deleteHint, rowActions, onSaved, unwrap, createLabel, initialFilters = {},
}: Props) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, error, loading, reload } = useApi(
    () => api.get<unknown>(endpoint, { q: debouncedQ || null, ...filterValues }),
    [endpoint, debouncedQ, JSON.stringify(filterValues)],
  );
  const rows = data ? (unwrap ? unwrap(data) : (data as Row[])) : [];
  const visibleFields = fields.filter((f) => (editing ? !f.createOnly : !f.editOnly));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaults });
    setErrors({});
    setServerError('');
    setFormOpen(true);
  };
  const openEdit = (row: Row) => {
    setEditing(row);
    setForm(toForm ? toForm(row) : Object.fromEntries(fields.map((f) => [f.name, (row[f.name] ?? '') as FormValues[string]])));
    setErrors({});
    setServerError('');
    setFormOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const f of visibleFields) {
      const v = form[f.name];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      if (f.required && empty) e[f.name] = `${f.label} is required`;
      else if (!empty && f.type === 'number') {
        const n = Number(v);
        if (Number.isNaN(n)) e[f.name] = 'Must be a number';
        else if (f.min !== undefined && n < f.min) e[f.name] = `Must be at least ${f.min}`;
        else if (f.max !== undefined && n > f.max) e[f.name] = `Must be at most ${f.max}`;
      }
      if (!e[f.name] && f.validate) {
        const msg = f.validate(v, form);
        if (msg) e[f.name] = msg;
      }
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setServerError('');
    try {
      const body = toPayload ? toPayload(form, !!editing) : form;
      if (editing) await api.put(`${endpoint}/${editing[idKey]}`, body);
      else await api.post(endpoint, body);
      toast.success(`${noun} ${editing ? 'updated' : 'created'}`);
      setFormOpen(false);
      reload();
      onSaved?.();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.del(`${endpoint}/${deleting[idKey]}`);
      toast.success(`${noun} deleted`);
      setDeleting(null);
      reload();
      onSaved?.();
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const setValue = (name: string, value: FormValues[string]) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const renderInput = (f: FieldDef) => {
    const value = form[f.name];
    const id = `rm-${f.name}`;
    const cls = `input ${errors[f.name] ? 'input-error' : ''}`;
    const options = typeof f.options === 'function' ? f.options(form) : f.options ?? [];
    switch (f.type) {
      case 'select':
        return (
          <select id={id} className={cls} value={String(value ?? '')} aria-invalid={!!errors[f.name]}
            onChange={(e) => setValue(f.name, e.target.value)}>
            <option value="">Select…</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2.5 py-2 text-sm text-ink-700">
            <input id={id} type="checkbox" className="size-4 accent-ink-700" checked={!!value} onChange={(e) => setValue(f.name, e.target.checked)} />
            {f.placeholder ?? 'Enabled'}
          </label>
        );
      case 'multiselect': {
        const list = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const on = list.includes(Number(o.value));
              return (
                <button key={o.value} type="button" aria-pressed={on} className={`chip ${on ? 'chip-active' : ''}`}
                  onClick={() => setValue(f.name, on ? list.filter((x) => x !== Number(o.value)) : [...list, Number(o.value)])}>
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      default:
        return (
          <input id={id} className={cls} aria-invalid={!!errors[f.name]}
            type={f.type === 'datetime' ? 'datetime-local' : f.type}
            min={f.min} max={f.max} step={f.step} maxLength={f.maxLength} placeholder={f.placeholder}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => setValue(f.name, e.target.value)} />
        );
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
            <input className="input py-2 pl-9" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </div>
          {filters.map((fl) => (fl.type === 'date' ? (
            <label key={fl.name} className="flex items-center gap-2 text-xs font-semibold text-ink-500">
              {fl.label}
              <input type="date" className="input w-auto py-2" value={filterValues[fl.name] ?? ''}
                onChange={(e) => setFilterValues((v) => ({ ...v, [fl.name]: e.target.value }))} />
            </label>
          ) : (
            <select key={fl.name} className="input w-auto max-w-56 py-2" aria-label={fl.label} value={filterValues[fl.name] ?? ''}
              onChange={(e) => setFilterValues((v) => ({ ...v, [fl.name]: e.target.value }))}>
              <option value="">{fl.label}: all</option>
              {(fl.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )))}
        </div>
        {fields.length > 0 && <Button onClick={openCreate}><Plus className="size-4" /> {createLabel ?? `Add ${noun.toLowerCase()}`}</Button>}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {!error && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="table-head">
                <tr>
                  {columns.map((c) => <th key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>{c.label}</th>)}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-paper-100 transition-opacity ${loading && data ? 'opacity-50' : ''}`}>
                {loading && !data && Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}><td colSpan={columns.length + 1} className="px-4 py-3"><Skeleton className="h-5" /></td></tr>
                ))}
                {rows.map((row) => (
                  <tr key={String(row[idKey])} className="hover:bg-paper-50">
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 align-top ${c.className ?? ''}`}>
                        {c.render ? c.render(row) : String(row[c.key] ?? '—')}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {rowActions?.(row, reload)}
                      {fields.length > 0 && (
                        <button onClick={() => openEdit(row)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900" aria-label={`Edit ${noun}`} title="Edit">
                          <Pencil className="size-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleting(row)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${noun}`} title="Delete">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data !== null && rows.length === 0 && (
            <div className="p-6"><EmptyState icon={<Search className="size-6" />} title={`No ${noun.toLowerCase()} records found`}>Try a different search or filter.</EmptyState></div>
          )}
          {rows.length > 0 && <p className="border-t border-paper-100 px-4 py-2.5 text-xs text-ink-400">{rows.length} row{rows.length > 1 ? 's' : ''}</p>}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={`${editing ? 'Edit' : 'New'} ${noun.toLowerCase()}`} size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button type="submit" form="rm-form" loading={saving}>{editing ? 'Save changes' : `Create ${noun.toLowerCase()}`}</Button>
        </>}>
        <form id="rm-form" onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
          {serverError && <p className="rounded bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 sm:col-span-2" role="alert">{serverError}</p>}
          {visibleFields.map((f) => (
            <div key={f.name} className={f.wide || f.type === 'multiselect' ? 'sm:col-span-2' : ''}>
              <Field label={f.label + (f.required ? ' *' : '')} error={errors[f.name]} hint={f.hint} htmlFor={`rm-${f.name}`}>
                {renderInput(f)}
              </Field>
            </div>
          ))}
        </form>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={`Delete ${noun.toLowerCase()}?`}
        footer={<>
          <Button variant="secondary" onClick={() => setDeleting(null)}>Keep it</Button>
          <Button variant="danger" onClick={confirmDelete} loading={deleteBusy}>Delete</Button>
        </>}>
        <p className="text-sm text-ink-600">This permanently removes the record.</p>
        <p className="mt-2 text-sm text-ink-500">{deleteHint ?? 'If other records depend on it, PostgreSQL foreign keys (ON DELETE RESTRICT) will refuse the delete and nothing changes.'}</p>
      </Modal>
    </div>
  );
}
