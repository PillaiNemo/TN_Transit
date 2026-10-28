import { useState } from 'react';
import { useToast } from '../hooks/useToast';
import { moneyExact } from '../lib/format';
import { api, errorMessage } from '../services/api';
import type { RefundQuote } from '../types';
import { Button, Modal } from './ui';

const REASONS = ['Change of travel plans', 'Booked another service', 'Medical emergency', 'Meeting rescheduled', 'Other'];

/** Confirmation dialog. The cancellation itself runs in the cancel_booking() SQL function. */
export function CancelBookingModal({ open, onClose, reference, quote, baseAmount, feeAmount, onCancelled }: {
  open: boolean; onClose: () => void; reference: string; quote?: RefundQuote | null;
  baseAmount: number; feeAmount: number; onCancelled: (refund: number) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ refund_amount: number }>(`/bookings/${reference}/cancel`, {
        reason: reason === 'Other' ? other.trim() || 'Other' : reason,
      });
      toast.success(`Booking ${reference} cancelled. Refund of ${moneyExact(result.refund_amount)} recorded.`);
      onCancelled(result.refund_amount);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cancellable = quote?.is_cancellable ?? false;
  return (
    <Modal open={open} onClose={onClose} title={`Cancel booking ${reference}?`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Keep booking</Button>
        <Button variant="danger" onClick={confirm} loading={busy} disabled={!cancellable}>Cancel booking</Button>
      </>}>
      {quote && cancellable ? (
        <div className="space-y-4">
          <div className="rounded bg-paper-100 p-4 text-sm">
            <p className="text-ink-600">Departure is in <span className="font-bold text-ink-900">{Math.floor(quote.hours_before_departure)} hours</span>, so the demo policy refunds <span className="font-bold text-ink-900">{quote.refund_percent}%</span> of the fare.</p>
            <dl className="mt-3 space-y-1">
              <div className="flex justify-between"><dt className="text-ink-500">Fare paid</dt><dd>{moneyExact(baseAmount)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Booking fee (non-refundable)</dt><dd>{moneyExact(feeAmount)}</dd></div>
              <div className="flex justify-between border-t border-paper-300 pt-1.5 font-bold text-clay-800"><dt>Refund</dt><dd>{moneyExact(quote.refund_amount)}</dd></div>
            </dl>
          </div>
          <div>
            <label htmlFor="cancel-reason" className="label">Reason</label>
            <select id="cancel-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            {reason === 'Other' && (
              <input className="input mt-2" maxLength={200} placeholder="Tell us briefly (optional)" value={other} onChange={(e) => setOther(e.target.value)} />
            )}
          </div>
          <p className="text-xs text-ink-500">Seats are released for other passengers straight away. Your booking stays in your history as Cancelled.</p>
        </div>
      ) : (
        <p className="text-sm text-ink-600">This booking can no longer be cancelled online — cancellations close shortly before departure.</p>
      )}
    </Modal>
  );
}
