'use client'

import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useSessionContext } from '../SessionContext'

const emptyForm = {
  earnerName: '',
  earnerEmail: '',
  earnerPhone: '',
  courseTitle: '',
  issueDate: '',
  expiryDate: '',
  signatoryName: '',
  signatoryTitle: '',
}

export default function GenerateCertModal({ onClose, onGenerated }) {
  const { session } = useSessionContext()
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Pre-fill the signatory from the institution's saved default (Profile
  // page) — only if the admin hasn't already typed something.
  useEffect(() => {
    fetch('/api/institution/profile', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        const institution = json.institution
        if (!institution) return
        setForm((prev) => ({
          ...prev,
          signatoryName: prev.signatoryName || institution.defaultSignatoryName || '',
          signatoryTitle: prev.signatoryTitle || institution.defaultSignatoryTitle || '',
        }))
      })
      .catch(() => {})
  }, [])

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/certificates/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Generation failed.')
      onGenerated(json.certificate)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Generate Certificate" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Earner full name" value={form.earnerName} onChange={update('earnerName')} required />
        <Field label="Earner email" value={form.earnerEmail} onChange={update('earnerEmail')} type="email" />
        <Field label="Earner phone" value={form.earnerPhone} onChange={update('earnerPhone')} />
        <Field label="Course / program title" value={form.courseTitle} onChange={update('courseTitle')} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Issue date" value={form.issueDate} onChange={update('issueDate')} type="date" />
          <Field label="Expiry date (optional)" value={form.expiryDate} onChange={update('expiryDate')} type="date" />
        </div>
        <Field label="Signatory name" value={form.signatoryName} onChange={update('signatoryName')} required />
        <Field label="Signatory title" value={form.signatoryTitle} onChange={update('signatoryTitle')} required />

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
            className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate certificate'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, ...props }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-700">
      {label}
      <input
        {...props}
        className="border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-[#B8962E]"
      />
    </label>
  )
}
