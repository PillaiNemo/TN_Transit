// The seats picked on the seat map are temporary UI state until the booking is
// confirmed. They are kept in sessionStorage only so a page refresh at checkout does not
// lose the selection. Nothing here is authoritative: the server re-checks every seat
// inside the booking transaction.
import type { BookingDraft } from '../types';

const key = (scheduleId: number) => `tnt.draft.${scheduleId}`;

export function saveDraft(draft: BookingDraft) {
  try { sessionStorage.setItem(key(draft.schedule_id), JSON.stringify(draft)); } catch { /* storage unavailable */ }
}

export function loadDraft(scheduleId: number): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(key(scheduleId));
    return raw ? (JSON.parse(raw) as BookingDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(scheduleId: number) {
  try { sessionStorage.removeItem(key(scheduleId)); } catch { /* ignore */ }
}
