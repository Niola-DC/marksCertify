// ============================================================
// MARKSCERTIFY — Cohort Detail
// File: /app/dashboard/cohorts/[cohortId]/page.js
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Users, CheckCircle2, FileBadge2, Mail, MessageCircle, UserPlus, Printer, AlertTriangle, RotateCw } from 'lucide-react'
import { useSessionContext } from '../../SessionContext'
import AddCohortMembersModal from '../../components/AddCohortMembersModal'

const STATUS_OPTIONS = [
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
]

export default function CohortDetailPage() {
  const { session } = useSessionContext()
  const params = useParams()
  const router = useRouter()
  const cohortId = params.cohortId

  const [cohort, setCohort] = useState(null)
  const [members, setMembers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddMembers, setShowAddMembers] = useState(false)

  // Tracks which member row currently has a status change in flight —
  // completion triggers real PDF generation + distribution, which takes
  // a few seconds, so each row needs its own independent loading state.
  const [pendingMemberId, setPendingMemberId] = useState(null)
  const [rowError, setRowError] = useState(null)
  const [retryingMemberId, setRetryingMemberId] = useState(null)
  const [retryError, setRetryError] = useState(null)

  const fetchCohort = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/cohorts/${cohortId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setCohort(json.cohort)
        setMembers(json.members)
        setStats(json.stats)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session, cohortId])

  useEffect(() => {
    fetchCohort()
  }, [fetchCohort])

  async function handleStatusChange(memberId, status) {
    setPendingMemberId(memberId)
    setRowError(null)
    try {
      const res = await fetch(`/api/cohorts/${cohortId}/members/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update status.')
      fetchCohort()
    } catch (err) {
      setRowError({ memberId, message: err.message })
    } finally {
      setPendingMemberId(null)
    }
  }

  function handleMembersAdded() {
    setShowAddMembers(false)
    fetchCohort()
  }

  async function handleRetryDelivery(member) {
    setRetryingMemberId(member.memberId)
    setRetryError(null)
    try {
      const res = await fetch('/api/certificates/distribute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ certId: member.certId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Retry failed.')
      fetchCohort()
    } catch (err) {
      setRetryError({ memberId: member.memberId, message: err.message })
    } finally {
      setRetryingMemberId(null)
    }
  }

  if (loading) return <p className="py-10 text-center text-sm text-zinc-400">Loading…</p>
  if (error) return <p className="py-10 text-center text-sm text-red-600">{error}</p>
  if (!cohort) return null

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={() => router.push('/dashboard/cohorts')}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 self-start"
      >
        <ArrowLeft size={14} />
        Back to Cohorts
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">{cohort.name}</h2>
          <p className="text-sm text-zinc-500">{cohort.program}</p>
        </div>
        <button
          onClick={() => setShowAddMembers(true)}
          className="flex shrink-0 items-center gap-2 rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <UserPlus size={16} />
          Add Participants
        </button>
      </div>

      {cohort.completionCriteria && (
        <p className="text-sm text-zinc-500 rounded-md bg-zinc-50 border border-zinc-200 px-4 py-2.5">
          <span className="font-medium text-zinc-700">Completion criteria:</span> {cohort.completionCriteria}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Members" value={stats.memberCount} />
        <StatCard icon={CheckCircle2} label="Completion Rate" value={`${stats.completionRate}%`} />
        <StatCard icon={FileBadge2} label="Certs Issued" value={stats.certsIssued} />
        <StatCard icon={AlertTriangle} label="Failed Deliveries" value={stats.failedCount} alert={stats.failedCount > 0} />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Certificate</th>
                <th className="px-6 py-3 font-medium">Delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-400">
                    No participants yet. Add some to get started.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.memberId} className="hover:bg-zinc-50">
                    <td className="px-6 py-3.5 font-medium text-zinc-900">{m.earnerName}</td>
                    <td className="px-6 py-3.5 text-zinc-500 text-xs">
                      {m.earnerEmail || '—'}{m.earnerPhone ? ` · ${m.earnerPhone}` : ''}
                    </td>
                    <td className="px-6 py-3.5">
                      <select
                        value={m.status}
                        disabled={pendingMemberId === m.memberId}
                        onChange={(e) => handleStatusChange(m.memberId, e.target.value)}
                        className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#B8962E] disabled:opacity-50 ${statusColor(m.status)}`}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {pendingMemberId === m.memberId && (
                        <span className="ml-2 text-xs text-zinc-400">Generating…</span>
                      )}
                      {rowError?.memberId === m.memberId && (
                        <p className="mt-1 text-xs text-red-600">{rowError.message}</p>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      {m.certId ? (
                        <a
                          href={m.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[#B8962E] font-medium"
                        >
                          <Printer size={13} />
                          {m.certId}
                        </a>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      {m.certId ? (
                        <div className="flex items-center gap-2">
                          <Mail
                            size={14}
                            className={m.emailError ? 'text-red-500' : m.emailSent ? 'text-green-600' : 'text-zinc-300'}
                            title={m.emailError ? `Failed: ${m.emailError}` : m.emailSent ? 'Emailed' : 'Not emailed'}
                          />
                          <MessageCircle
                            size={14}
                            className={m.whatsappError ? 'text-red-500' : m.whatsappSent ? 'text-green-600' : 'text-zinc-300'}
                            title={m.whatsappError ? `Failed: ${m.whatsappError}` : m.whatsappSent ? 'Sent via WhatsApp' : 'Not sent via WhatsApp'}
                          />
                          {(m.emailError || m.whatsappError) && (
                            <button
                              onClick={() => handleRetryDelivery(m)}
                              disabled={retryingMemberId === m.memberId}
                              title="Retry delivery"
                              className="flex items-center gap-1 text-xs font-medium text-[#B8962E] hover:text-[#96771f] disabled:opacity-50"
                            >
                              <RotateCw size={12} className={retryingMemberId === m.memberId ? 'animate-spin' : ''} />
                              Retry
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                      {rowError?.memberId === m.memberId && (
                        <p className="mt-1 text-xs text-red-600">{rowError.message}</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddMembers && (
        <AddCohortMembersModal cohortId={cohortId} onClose={() => setShowAddMembers(false)} onAdded={handleMembersAdded} />
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wide">
        <Icon size={14} />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-zinc-900">{value}</p>
    </div>
  )
}

function statusColor(status) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700'
    case 'in_progress': return 'bg-amber-100 text-amber-700'
    case 'dropped': return 'bg-red-100 text-red-700'
    default: return 'bg-zinc-100 text-zinc-600'
  }
}
