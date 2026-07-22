'use client'

import { useState } from 'react'
import { Mail, MessageCircle, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import Modal from './Modal'
import { useSessionContext } from '../SessionContext'

export default function DistributeModal({ cert, onClose, onDistributed }) {
  const { session } = useSessionContext()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)

  async function handleSend() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/certificates/distribute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ certId: cert.certId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Distribution failed.')
      setResults(json.results)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleDone() {
    onDistributed()
  }

  return (
    <Modal title="Distribute Certificate" onClose={onClose} maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="rounded-md bg-zinc-50 border border-zinc-200 p-4 text-sm">
          <p className="font-medium text-zinc-900">{cert.earnerName}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {cert.earnerEmail || 'No email on file'}
            {cert.earnerPhone ? ` · ${cert.earnerPhone}` : ''}
          </p>
          <p className="text-xs text-[#B8962E] mt-1">{cert.certId}</p>
        </div>

        {!results ? (
          <p className="text-sm text-zinc-600">
            Sends the certificate PDF and verify link by email and WhatsApp, wherever contact details are on
            file.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <ChannelResult icon={Mail} label="Email" result={results.email} error={results.emailError} />
            <ChannelResult icon={MessageCircle} label="WhatsApp" result={results.whatsapp} error={results.whatsappError} />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          {!results ? (
            <>
              <button
                onClick={onClose}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send Certificate'}
              </button>
            </>
          ) : (
            <>
              {(results.email === 'failed' || results.whatsapp === 'failed') && (
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {loading ? 'Retrying…' : 'Retry'}
                </button>
              )}
              <button
                onClick={handleDone}
                className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ChannelResult({ icon: Icon, label, result, error }) {
  const isSent = result === 'sent'
  const isFailed = result === 'failed'
  const isSkipped = !isSent && !isFailed

  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-2.5">
      <Icon size={16} className="text-zinc-400 shrink-0" />
      <span className="text-sm text-zinc-700 flex-1">{label}</span>
      {isSent && (
        <span className="flex items-center gap-1 text-xs font-medium text-green-700">
          <CheckCircle2 size={14} /> Sent
        </span>
      )}
      {isFailed && (
        <span className="flex items-center gap-1 text-xs font-medium text-red-600" title={error}>
          <XCircle size={14} /> Failed
        </span>
      )}
      {isSkipped && (
        <span className="flex items-center gap-1 text-xs font-medium text-zinc-400">
          <MinusCircle size={14} /> {result?.replace('skipped — ', '') || 'Skipped'}
        </span>
      )}
    </div>
  )
}
