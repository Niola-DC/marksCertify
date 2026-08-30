// ============================================================
// MARKSCERTIFY — Edit Cohort Modal
// File: /app/dashboard/components/EditCohortModal.js
//
// Same seven fields as CreateCohortModal, but pre-filled from an
// existing cohort and PATCHing it instead of creating one. Kept as its
// own file to match the one-modal-per-action pattern in this folder and
// to leave the create flow untouched.
// ============================================================

'use client'

import { useState } from 'react'
import Modal from './Modal'
import { useSessionContext } from '../SessionContext'

// <input type="date"> needs a bare YYYY-MM-DD. The API returns Postgres
// `date` values already in that form; slice defensively in case a full
// timestamp ever comes back.
function toDateInput(value) {
  return value ? String(value).slice(0, 10) : ''
}

export default function EditCohortModal({ cohort, onClose, onSaved }) {
  const { session } = useSessionContext()
  const [form, setForm] = useState({
    name: cohort.name || '',
    program: cohort.program || '',
    startDate: toDateInput(cohort.startDate),
    endDate: toDateInput(cohort.endDate),
    completionCriteria: cohort.completionCriteria || '',
    signatoryName: cohort.signatoryName || '',
    signatoryTitle: cohort.signatoryTitle || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/cohorts/${cohort.cohortId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update cohort.')
      onSaved(json.cohort)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Edit Cohort" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span>Cohort Name <span className="text-red-500">*</span></span>
          <input
            value={form.name}
            onChange={update('name')}
            placeholder="e.g. July 2026 Web Dev Cohort"
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span>Program / Course Title <span className="text-red-500">*</span></span>
          <input
            value={form.program}
            onChange={update('program')}
            placeholder="e.g. Web Development Fundamentals"
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
            required
          />
          <span className="text-xs text-zinc-400">
            Only affects certificates issued after this change. Certificates already issued keep their original title.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            <span>Start Date</span>
            <input
              type="date"
              value={form.startDate}
              onChange={update('startDate')}
              max={form.endDate || undefined}
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            <span>End Date</span>
            <input
              type="date"
              value={form.endDate}
              onChange={update('endDate')}
              min={form.startDate || undefined}
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span>Completion Criteria</span>
          <input
            value={form.completionCriteria}
            onChange={update('completionCriteria')}
            placeholder="e.g. Attendance >= 80% and final project submitted"
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
          />
          <span className="text-xs text-zinc-400">
            Reference note for your own tracking — not enforced automatically. You mark participants Completed manually.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3 border-t border-zinc-200 pt-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            <span>Signatory Name <span className="text-red-500">*</span></span>
            <input
              value={form.signatoryName}
              onChange={update('signatoryName')}
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            <span>Signatory Title <span className="text-red-500">*</span></span>
            <input
              value={form.signatoryTitle}
              onChange={update('signatoryTitle')}
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
              required
            />
          </label>
          <p className="col-span-2 text-xs text-zinc-400">
            Used on every certificate auto-issued when a participant is marked Completed.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
