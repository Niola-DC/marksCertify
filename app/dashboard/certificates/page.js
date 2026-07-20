// ============================================================
// MARKSCERTIFY — Certificate List (admin)
// File: /app/dashboard/certificates/page.js
// ============================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Plus, MoreVertical, Printer, Ban, ShieldCheck, Upload } from 'lucide-react'
import { useSessionContext } from '../SessionContext'
import GenerateCertModal from '../components/GenerateCertModal'
import RevokeModal from '../components/RevokeModal'
import BatchUploadModal from '../components/BatchUploadModal'

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

  function handleBatchComplete() {
    setShowBatchUpload(false)
    setPage(1)
    fetchCertificates()
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search certificates"
            className="w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
          />
        </div>
        <button
          onClick={() => setShowBatchUpload(true)}
          className="ml-auto flex items-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Upload size={16} />
          Batch Upload
        </button>
        <button
          onClick={() => setShowGenerate(true)}
          className="flex items-center gap-2 rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Plus size={16} />
          Add Certificate
        </button>
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
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-zinc-400">Loading…</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-red-600">{error}</td>
              </tr>
            ) : data.certificates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-zinc-400">No certificates found.</td>
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
                  <td className="px-6 py-3.5 text-right relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === cert.certId ? null : cert.certId)}
                      className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenu === cert.certId && (
                      <RowMenu
                        cert={cert}
                        onClose={() => setOpenMenu(null)}
                        onRevoke={() => {
                          setOpenMenu(null)
                          setRevokeTarget(cert)
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

function RowMenu({ cert, onClose, onRevoke }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-6 top-full mt-1 z-20 w-44 rounded-md border border-zinc-200 bg-white shadow-lg py-1 text-left">
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
    </>
  )
}
