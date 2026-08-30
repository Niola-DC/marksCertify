'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

// Generic "are you sure?" dialog — icon, message, Cancel / Confirm.
// Used for Log Out today; reusable for any future destructive or
// consequential action (revoke, delete, etc).
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={title} onClose={onCancel} maxWidth="max-w-sm">
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div className={`h-12 w-12 rounded-full flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
          <AlertTriangle size={22} className={danger ? 'text-red-600' : 'text-amber-600'} />
        </div>
        <p className="text-sm font-medium text-zinc-800">{message}</p>
      </div>

      {error && <p className="pt-3 text-center text-sm text-red-600">{error}</p>}

      <div className="flex justify-center gap-3 pt-4">
        <button
          onClick={onCancel}
          className="rounded-md border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className={`rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#0D0D0D] hover:bg-zinc-800'
          }`}
        >
          {loading ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
