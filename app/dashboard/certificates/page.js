// ============================================================
// MARKSCERTIFY — Certificate List (admin)
// File: /app/dashboard/certificates/page.js
// ============================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { Search, Plus, MoreVertical, Printer, Ban, ShieldCheck, Upload, Send, Mail, MessageCircle } from 'lucide-react'
import { useSessionContext } from '../SessionContext'
import GenerateCertModal from '../components/GenerateCertModal'
import RevokeModal from '../components/RevokeModal'
import BatchUploadModal from '../components/BatchUploadModal'
import DistributeModal from '../components/DistributeModal'

const PAGE_SIZE = 10

export default function CertificatesPage() {
  const { session } = useSessionContext()
  const searchParams = useSearchParams()

  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ certificates: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showGenerate, setShowGenerate] = useState(searchParams.get('generate') === '1')
  const [showBatchUpload, setShowBatchUpload] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [distributeTarget, setDistributeTarget] = useState(null)
  const [openMenu, setOpenMenu] = useState(null)

  const debounceRef = useRef(null)

  const fetchCertificates = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (query.trim()) params.set('q', query.trim())

    fetch(`/api/certificates/list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [page, query, session])

  useEffect(() => {
    fetchCertificates()
  }, [fetchCertificates])

  function handleSearchChange(e) {
    const value = e.target.value
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPage(1), 400)
  }

  function handleGenerated() {
    setShowGenerate(false)
    setPage(1)
    fetchCertificates()
  }

  function handleRevoked() {
    setRevokeTarget(null)
    fetchCertificates()
  }

  function handleDistributed() {
    setDistributeTarget(null)
    fetchCertificates()
  }

  function handleBatchComplete() {
    setShowBatchUpload(false)
    setPage(1)
    fetchCertificates()
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search certificates"
            className="w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
          />
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <button
            onClick={() => setShowBatchUpload(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Upload size={16} />
            <span className="whitespace-nowrap">Batch Upload</span>
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus size={16} />
            <span className="whitespace-nowrap">Add Certificate</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200">
        <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
              <th className="px-6 py-3 font-medium">Cert ID</th>
              <th className="px-6 py-3 font-medium">Earner</th>
              <th className="px-6 py-3 font-medium">Course</th>
              <th className="px-6 py-3 font-medium">Issue Date</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Delivery</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-zinc-400">Loading…</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-red-600">{error}</td>
              </tr>
            ) : data.certificates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-zinc-400">No certificates found.</td>
              </tr>
            ) : (
              data.certificates.map((cert) => (
                <tr key={cert.certId} className="hover:bg-zinc-50">
                  <td className="px-6 py-3.5 font-medium text-[#B8962E]">{cert.certId}</td>
                  <td className="px-6 py-3.5 text-zinc-900">{cert.earnerName}</td>
                  <td className="px-6 py-3.5 text-zinc-600">{cert.courseTitle}</td>
                  <td className="px-6 py-3.5 text-zinc-600">
                    {new Date(cert.issueDate).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge status={cert.status} />
                  </td>
                  <td className="px-6 py-3.5">
                    <DeliveryStatus cert={cert} />
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setOpenMenu(openMenu?.certId === cert.certId ? null : { certId: cert.certId, rect })
                      }}
                      className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenu?.certId === cert.certId && (
                      <RowMenu
                        cert={cert}
                        anchorRect={openMenu.rect}
                        onClose={() => setOpenMenu(null)}
                        onRevoke={() => {
                          setOpenMenu(null)
                          setRevokeTarget(cert)
                        }}
                        onDistribute={() => {
                          setOpenMenu(null)
                          setDistributeTarget(cert)
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 text-sm text-zinc-500">
          <span>
            {data.total === 0
              ? '0 results'
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data.total)} of ${data.total}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-md border border-zinc-200 disabled:opacity-40"
            >
              Prev
            </button>
            <span>{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-md border border-zinc-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showGenerate && (
        <GenerateCertModal onClose={() => setShowGenerate(false)} onGenerated={handleGenerated} />
      )}
      {revokeTarget && (
        <RevokeModal cert={revokeTarget} onClose={() => setRevokeTarget(null)} onRevoked={handleRevoked} />
      )}
      {showBatchUpload && (
        <BatchUploadModal onClose={() => setShowBatchUpload(false)} onComplete={handleBatchComplete} />
      )}
      {distributeTarget && (
        <DistributeModal
          cert={distributeTarget}
          onClose={() => setDistributeTarget(null)}
          onDistributed={handleDistributed}
        />
      )}
    </div>
  )
}

function DeliveryStatus({ cert }) {
  return (
    <div className="flex items-center gap-2">
      <Mail
        size={14}
        className={cert.emailSent ? 'text-green-600' : 'text-zinc-300'}
        title={cert.emailSent ? `Emailed ${new Date(cert.emailSentAt).toLocaleDateString('en-NG')}` : 'Not emailed'}
      />
      <MessageCircle
        size={14}
        className={cert.whatsappSent ? 'text-green-600' : 'text-zinc-300'}
        title={cert.whatsappSent ? `Sent via WhatsApp ${new Date(cert.whatsappSentAt).toLocaleDateString('en-NG')}` : 'Not sent via WhatsApp'}
      />
    </div>
  )
}

function StatusBadge({ status }) {
  const isActive = status === 'active'
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {isActive ? 'Active' : 'Revoked'}
    </span>
  )
}

// Rendered via a portal straight into <body>, positioned with `fixed`
// coordinates computed from the trigger button's actual screen position.
// The row lives inside a horizontally-scrolling table container, and a
// plain `position: absolute` dropdown gets silently clipped by it — CSS
// forces overflow-y to `auto` on any element with overflow-x set to
// anything but `visible`, so the container was cropping the menu instead
// of letting it float above the table.
function RowMenu({ cert, anchorRect, onClose, onRevoke, onDistribute }) {
  const MENU_WIDTH = 176 // w-44

  useEffect(() => {
    function handleScrollOrResize() {
      onClose()
    }
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style = {
    top: anchorRect.bottom + 4,
    left: Math.max(8, anchorRect.right - MENU_WIDTH),
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={style}
        className="fixed z-50 w-44 rounded-md border border-zinc-200 bg-white shadow-lg py-1 text-left"
      >
        {cert.status !== 'revoked' && (
          <button
            onClick={onDistribute}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <Send size={14} />
            Distribute
          </button>
        )}
        <a
          href={cert.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          <Printer size={14} />
          Print / Download
        </a>
        <a
          href={cert.verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          <ShieldCheck size={14} />
          View Verify Page
        </a>
        {cert.status !== 'revoked' && (
          <button
            onClick={onRevoke}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Ban size={14} />
            Revoke
          </button>
        )}
      </div>
    </>,
    document.body
  )
}
