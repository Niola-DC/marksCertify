// ============================================================
// MARKSCERTIFY — Public Retrieval Portal
// File: /app/portal/page.js
//
// Earners find their certificate by name, email, or Cert ID.
// No login required. Mobile-first — most earners land here from
// a WhatsApp/email link on a phone.
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'

export default function PortalPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(null)
      setError(null)
      setSearched(false)
      return
    }

    debounceRef.current = setTimeout(() => runSearch(trimmed), 400)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function runSearch(term) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/search?q=${encodeURIComponent(term)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Search failed.')
      setResults(json.certificates)
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    runSearch(trimmed)
  }

  return (
    <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center flex flex-col gap-1">
          <p className="text-[11px] tracking-[3px] uppercase text-[#B8962E] font-semibold">MarksCertify</p>
          <h1 className="text-xl font-semibold text-white">Find your certificate</h1>
          <p className="text-sm text-white/40">Search by name, email, or Certificate ID</p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            inputMode="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Adaeze Okafor or MC-2026-NG-00003"
            className="flex-1 rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#B8962E]"
          />
          <button
            type="submit"
            className="rounded-md bg-[#B8962E] px-4 py-3 text-sm font-semibold text-[#0D0D0D]"
          >
            Search
          </button>
        </form>

        {loading && <p className="text-center text-sm text-white/40">Searching…</p>}

        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}

        {!loading && searched && !error && results?.length === 0 && (
          <p className="text-center text-sm text-white/40">
            No certificates found for &ldquo;{query}&rdquo;.
          </p>
        )}

        {!loading && results?.length > 0 && (
          <div className="flex flex-col gap-3">
            {results.map((cert) => (
              <ResultCard key={cert.certId} cert={cert} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function ResultCard({ cert }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(cert.verifyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API unavailable — ignore, link is still visible via the button
    }
  }

  const isActive = cert.status === 'active'

  return (
    <div className="rounded-xl border border-[#B8962E]/25 bg-[#161616] overflow-hidden">
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[1.5px] text-white/35">Issued to</p>
            <p className="text-base font-semibold text-white">{cert.earnerName}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              isActive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
            }`}
          >
            {cert.status}
          </span>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[1.5px] text-white/35">Course</p>
          <p className="text-sm text-white/90">{cert.courseTitle}</p>
        </div>

        <div className="flex justify-between text-xs text-white/50">
          <span>{cert.institutionName}</span>
          <span>
            {new Date(cert.issueDate).toLocaleDateString('en-NG', {
              day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
            })}
          </span>
        </div>

        <p className="text-[11px] font-medium tracking-wide text-[#B8962E]/90">{cert.certId}</p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-[#B8962E]/15 border-t border-[#B8962E]/15">
        <a
          href={cert.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="py-3 text-center text-xs font-medium text-white/80 hover:bg-white/5"
        >
          Download
        </a>
        <button
          onClick={copyLink}
          className="py-3 text-center text-xs font-medium text-white/80 hover:bg-white/5"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <a
          href={`/verify/${cert.certId}`}
          className="py-3 text-center text-xs font-medium text-[#B8962E] hover:bg-white/5"
        >
          Verify
        </a>
      </div>
    </div>
  )
}
