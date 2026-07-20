// ============================================================
// MARKSCERTIFY — Admin Overview
// File: /app/dashboard/page.js
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, BarChart3, ShieldCheck, Tag, FilePlus2, ListChecks } from 'lucide-react'
import { useSessionContext } from './SessionContext'

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(dateString).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function OverviewPage() {
  const { session } = useSessionContext()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/stats', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then(setStats)
      .finally(() => setLoading(false))
  }, [session])

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading dashboard…</p>
  }

  if (!stats || stats.error) {
    return <p className="text-sm text-red-600">{stats?.error || 'Failed to load dashboard.'}</p>
  }

  const usagePct = stats.institution.planLimit === Infinity
    ? 0
    : Math.round((stats.institution.certsThisMonth / stats.institution.planLimit) * 100)

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          icon={Award}
          label="Total Certificates"
          value={stats.totals.total.toLocaleString()}
          sub="Issued all-time"
        />
        <StatCard
          icon={BarChart3}
          label="This Month"
          value={`${stats.institution.certsThisMonth}${
            stats.institution.planLimit === Infinity ? '' : ` / ${stats.institution.planLimit}`
          }`}
          sub={stats.institution.planLimit === Infinity ? 'Unlimited plan' : `${usagePct}% of monthly limit used`}
        />
        <StatCard
          icon={ShieldCheck}
          label="Active / Revoked"
          value={`${stats.totals.active} / ${stats.totals.revoked}`}
          sub="Certificate status"
        />
        <StatCard
          icon={Tag}
          label="Plan"
          value={stats.institution.planTier}
          sub={stats.institution.name}
          capitalizeValue
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Recent Activity</h2>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-zinc-400">No certificates issued yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {stats.recent.map((cert) => (
                <div key={cert.certId} className="flex items-center gap-4 py-3">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-[#B8962E]/10 flex items-center justify-center">
                    <Award size={16} className="text-[#B8962E]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {cert.earnerName} — {cert.courseTitle}
                    </p>
                    <p className="text-xs text-zinc-400">{cert.certId}</p>
                  </div>
                  <p className="text-xs text-zinc-400 shrink-0">{timeAgo(cert.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard/certificates?generate=1"
              className="flex items-center gap-2 rounded-lg bg-[#0D0D0D] text-white px-4 py-3 text-sm font-medium hover:bg-zinc-800"
            >
              <FilePlus2 size={16} />
              Generate Certificate
            </Link>
            <Link
              href="/dashboard/certificates"
              className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <ListChecks size={16} />
              View All Certificates
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, capitalizeValue }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-zinc-500">{label}</p>
        <Icon size={18} className="text-zinc-300" />
      </div>
      <p className={`text-2xl font-semibold text-zinc-900 ${capitalizeValue ? 'capitalize' : ''}`}>{value}</p>
      <p className="text-xs text-zinc-400 mt-1">{sub}</p>
    </div>
  )
}
