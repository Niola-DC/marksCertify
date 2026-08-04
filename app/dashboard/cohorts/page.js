// ============================================================
// MARKSCERTIFY — Cohorts List
// File: /app/dashboard/cohorts/page.js
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Users, CheckCircle2, FileBadge2 } from 'lucide-react'
import { useSessionContext } from '../SessionContext'
import CreateCohortModal from '../components/CreateCohortModal'

export default function CohortsPage() {
  const { session } = useSessionContext()
  const [cohorts, setCohorts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const fetchCohorts = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/cohorts', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setCohorts(json.cohorts || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session])

  useEffect(() => {
    fetchCohorts()
  }, [fetchCohorts])

  function handleCreated(cohort) {
    setShowCreate(false)
    setCohorts((prev) => [cohort, ...prev])
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Group earners by program and auto-issue certificates the moment they&apos;re marked Completed.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex shrink-0 items-center gap-2 rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Plus size={16} />
          Create Cohort
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-400">Loading…</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-600">{error}</p>
      ) : cohorts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white py-16 text-center">
          <Users size={28} className="mx-auto mb-3 text-zinc-300" />
          <p className="text-sm text-zinc-500">No cohorts yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-[#B8962E]"
          >
            Create your first cohort
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cohorts.map((cohort) => (
            <Link
              key={cohort.cohortId}
              href={`/dashboard/cohorts/${cohort.cohortId}`}
              className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 hover:border-[#B8962E] transition-colors"
            >
              <div>
                <p className="font-semibold text-zinc-900">{cohort.name}</p>
                <p className="text-sm text-zinc-500">{cohort.program}</p>
              </div>

              {(cohort.startDate || cohort.endDate) && (
                <p className="text-xs text-zinc-400">
                  {formatDate(cohort.startDate)}
                  {cohort.endDate ? ` – ${formatDate(cohort.endDate)}` : ''}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 text-xs text-zinc-500 border-t border-zinc-100 pt-3">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 font-semibold text-zinc-700">
                    <Users size={13} />
                    {cohort.memberCount}
                  </span>
                  <span>member{cohort.memberCount === 1 ? '' : 's'}</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 font-semibold text-zinc-700">
                    <CheckCircle2 size={13} />
                    {cohort.completionRate}%
                  </span>
                  <span>complete</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 font-semibold text-zinc-700">
                    <FileBadge2 size={13} />
                    {cohort.certsIssued}
                  </span>
                  <span>issued</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCohortModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
