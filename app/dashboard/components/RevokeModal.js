'use client'

import { useState } from 'react'
import Modal from './Modal'
import { useSessionContext } from '../SessionContext'

export default function RevokeModal({ cert, onClose, onRevoked }) {
  const { session } = useSessionContext()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleRevoke() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/certificates/${cert.certId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to revoke certificate.')
      onRevoked(cert.certId)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Revoke Certificate" onClose={onClose} maxWidth="max-w-md">
      <p className="text-sm text-zinc-600 mb-4">
        Revoking <span className="font-medium text-zinc-900">{cert.certId}</span> ({cert.earnerName}) will
        immediately mark it invalid on the public verify page. This cannot be undone.
      </p>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 mb-4">
        Reason (optional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-[#B8962E]"
          placeholder="e.g. Issued in error"
        />
      </label>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          onClick={handleRevoke}
          disabled={loading}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Revoking…' : 'Revoke certificate'}
        </button>
      </div>
    </Modal>
  )
}
