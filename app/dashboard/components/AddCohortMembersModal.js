// ============================================================
// MARKSCERTIFY — Add Cohort Members Modal
// File: /app/dashboard/components/AddCohortMembersModal.js
//
// Two ways in: CSV upload (column-mapped, mirrors BatchUploadModal's
// pattern) or manual entry (a growing list of rows). Adding participants
// is a cheap DB write (no PDF generation), so unlike batch cert upload
// this submits in one request rather than chunked with a progress bar.
// ============================================================

'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { Upload, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { useSessionContext } from '../SessionContext'

const FIELDS = [
  { key: 'earnerName', label: 'Full Name', required: true, aliases: ['name', 'full name', 'earner name', 'fullname', 'student name', 'earner'] },
  { key: 'earnerEmail', label: 'Email', required: false, aliases: ['email', 'e-mail', 'earner email'] },
  { key: 'earnerPhone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'mobile', 'whatsapp', 'earner phone'] },
]

function normalizeHeader(h) {
  return h
    .replace(/['’]s\b/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function guessMapping(headers) {
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }))
  const mapping = {}
  for (const field of FIELDS) {
    const normAliases = [field.key, ...field.aliases].map(normalizeHeader)
    let match = normalizedHeaders.find((h) => normAliases.includes(h.norm))
    if (!match) {
      match = normalizedHeaders.find((h) => normAliases.some((a) => h.norm.includes(a) || a.includes(h.norm)))
    }
    mapping[field.key] = match ? match.raw : ''
  }
  return mapping
}

const emptyRow = () => ({ earnerName: '', earnerEmail: '', earnerPhone: '' })

export default function AddCohortMembersModal({ cohortId, onClose, onAdded }) {
  const { session } = useSessionContext()
  const [mode, setMode] = useState('csv') // csv | manual
  const [step, setStep] = useState('input') // input | map | done

  const [fileName, setFileName] = useState('')
  const [csvRows, setCsvRows] = useState([])
  const [csvHeaders, setCsvHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [parseError, setParseError] = useState(null)

  const [manualRows, setManualRows] = useState([emptyRow()])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [results, setResults] = useState(null) // { addedCount, failureCount, results }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        if (!parsed.meta.fields?.length) {
          setParseError('Could not read any columns from this file.')
          return
        }
        setCsvHeaders(parsed.meta.fields)
        setCsvRows(parsed.data)
        setMapping(guessMapping(parsed.meta.fields))
        setStep('map')
      },
      error: (err) => setParseError(err.message),
    })
  }

  function updateManualRow(index, field, value) {
    setManualRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function addManualRow() {
    setManualRows((prev) => [...prev, emptyRow()])
  }

  function removeManualRow(index) {
    setManualRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function submitMembers(members) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/cohorts/${cohortId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ members }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add members.')
      setResults(json)
      setStep('done')
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleCsvSubmit() {
    const members = csvRows
      .map((rawRow) => {
        const row = {}
        for (const field of FIELDS) {
          const header = mapping[field.key]
          row[field.key] = header ? (rawRow[header] || '').trim() : ''
        }
        return row
      })
      .filter((row) => row.earnerName)
    submitMembers(members)
  }

  function handleManualSubmit() {
    const members = manualRows
      .map((r) => ({ earnerName: r.earnerName.trim(), earnerEmail: r.earnerEmail.trim(), earnerPhone: r.earnerPhone.trim() }))
      .filter((r) => r.earnerName)
    submitMembers(members)
  }

  const requiredMapped = Boolean(mapping.earnerName)

  return (
    <Modal title="Add Participants" onClose={onClose} maxWidth="max-w-xl">
      {step !== 'done' && (
        <div className="mb-4 flex gap-2 rounded-md bg-zinc-100 p-1 text-sm">
          <button
            onClick={() => setMode('csv')}
            className={`flex-1 rounded px-3 py-1.5 font-medium ${mode === 'csv' ? 'bg-white shadow text-zinc-900' : 'text-zinc-500'}`}
          >
            CSV Upload
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 rounded px-3 py-1.5 font-medium ${mode === 'manual' ? 'bg-white shadow text-zinc-900' : 'text-zinc-500'}`}
          >
            Manual Entry
          </button>
        </div>
      )}

      {mode === 'csv' && step === 'input' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">
            Upload a CSV with one row per participant. Only Full Name is required.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 py-10 cursor-pointer hover:border-[#B8962E]">
            <Upload size={24} className="text-zinc-400" />
            <span className="text-sm text-zinc-500">{fileName || 'Click to select a CSV file'}</span>
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </label>
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}
        </div>
      )}

      {mode === 'csv' && step === 'map' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">
            {csvRows.length} rows found in <span className="font-medium">{fileName}</span>. Match each field to a column.
          </p>
          <div className="flex flex-col gap-3">
            {FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm text-zinc-700">
                <span>{field.label} {field.required && <span className="text-red-500">*</span>}</span>
                <select
                  value={mapping[field.key] || ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="border border-zinc-200 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">— none —</option>
                  {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {!requiredMapped && <p className="text-sm text-amber-700">Map Full Name to continue.</p>}
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setStep('input')} className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              Back
            </button>
            <button
              onClick={handleCsvSubmit}
              disabled={!requiredMapped || submitting}
              className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {submitting ? 'Adding…' : `Add ${csvRows.length} Participant${csvRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {mode === 'manual' && step === 'input' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
            {manualRows.map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <input
                    value={row.earnerName}
                    onChange={(e) => updateManualRow(i, 'earnerName', e.target.value)}
                    placeholder="Full name *"
                    className="border border-zinc-200 rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={row.earnerEmail}
                    onChange={(e) => updateManualRow(i, 'earnerEmail', e.target.value)}
                    placeholder="Email"
                    className="border border-zinc-200 rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={row.earnerPhone}
                    onChange={(e) => updateManualRow(i, 'earnerPhone', e.target.value)}
                    placeholder="Phone"
                    className="border border-zinc-200 rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  onClick={() => removeManualRow(i)}
                  disabled={manualRows.length === 1}
                  className="p-1.5 text-zinc-400 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addManualRow} className="flex items-center gap-1 self-start text-sm font-medium text-[#B8962E]">
            <Plus size={14} />
            Add another
          </button>
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          <div className="flex justify-end gap-3 pt-2 border-t border-zinc-200">
            <button onClick={onClose} className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              Cancel
            </button>
            <button
              onClick={handleManualSubmit}
              disabled={submitting || !manualRows.some((r) => r.earnerName.trim())}
              className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {submitting ? 'Adding…' : 'Add Participants'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && results && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-zinc-50 border border-zinc-200 p-4 text-sm">
            <p className="flex items-center gap-2 text-green-700 font-medium">
              <CheckCircle2 size={16} />
              {results.addedCount} participant{results.addedCount === 1 ? '' : 's'} added
            </p>
            {results.failureCount > 0 && (
              <p className="mt-1 flex items-center gap-2 text-amber-700">
                <AlertTriangle size={16} />
                {results.failureCount} row{results.failureCount === 1 ? '' : 's'} failed
              </p>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => onAdded()}
              className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
