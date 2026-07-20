// ============================================================
// MARKSCERTIFY — Batch Certificate Upload (CSV)
// File: /app/dashboard/components/BatchUploadModal.js
//
// Flow: select CSV -> map columns to cert fields -> review
// validation -> submit in chunks with a progress bar -> summary
// (with retry for rows that failed server-side).
// ============================================================

'use client'

import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Modal from './Modal'
import { useSessionContext } from '../SessionContext'

const FIELDS = [
  { key: 'earnerName', label: 'Earner Name', required: true, aliases: ['name', 'full name', 'earner name', 'fullname', 'student name', 'earner'] },
  { key: 'earnerEmail', label: 'Earner Email', required: false, aliases: ['email', 'e-mail', 'earner email'] },
  { key: 'earnerPhone', label: 'Earner Phone', required: false, aliases: ['phone', 'phone number', 'mobile', 'whatsapp', 'earner phone'] },
  { key: 'courseTitle', label: 'Course / Program Title', required: true, aliases: ['course', 'course title', 'program', 'program title', 'course/program title'] },
  { key: 'issueDate', label: 'Issue Date', required: false, aliases: ['issue date', 'date', 'issued', 'issued date'] },
  { key: 'expiryDate', label: 'Expiry Date', required: false, aliases: ['expiry date', 'expiry', 'expires', 'expiration date'] },
  { key: 'signatoryName', label: 'Signatory Name', required: true, aliases: ['signatory name', 'signatory', 'signed by'] },
  { key: 'signatoryTitle', label: 'Signatory Title', required: true, aliases: ['signatory title', 'role'] },
]

const CHUNK_SIZE = 20

function guessMapping(headers) {
  const mapping = {}
  for (const field of FIELDS) {
    const match = headers.find((h) => {
      const norm = h.trim().toLowerCase()
      return norm === field.key.toLowerCase() || field.aliases.includes(norm)
    })
    mapping[field.key] = match || ''
  }
  return mapping
}

function downloadSampleCsv() {
  const headers = FIELDS.map((f) => f.label).join(',')
  const example = '"Adaeze Okafor","adaeze@example.com","08012345678","Digital Marketing Bootcamp","2026-07-20","","Eniola Chinemerem","Founder"'
  const blob = new Blob([`${headers}\n${example}\n`], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'markscertify-batch-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function BatchUploadModal({ onClose, onComplete }) {
  const { session } = useSessionContext()

  const [step, setStep] = useState('select') // select | map | progress | done
  const [fileName, setFileName] = useState('')
  const [csvRows, setCsvRows] = useState([])
  const [csvHeaders, setCsvHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [parseError, setParseError] = useState(null)

  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [serverFailures, setServerFailures] = useState([]) // { row, error }
  const [successCount, setSuccessCount] = useState(0)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields?.length) {
          setParseError('Could not read any columns from this file.')
          return
        }
        setCsvHeaders(results.meta.fields)
        setCsvRows(results.data)
        setMapping(guessMapping(results.meta.fields))
        setStep('map')
      },
      error: (err) => setParseError(err.message),
    })
  }

  // Normalize CSV rows using the current column mapping, and split
  // into rows that pass client-side required-field validation vs. not.
  const { validRows, invalidRows } = useMemo(() => {
    const valid = []
    const invalid = []

    csvRows.forEach((rawRow, i) => {
      const normalized = {}
      for (const field of FIELDS) {
        const header = mapping[field.key]
        normalized[field.key] = header ? (rawRow[header] || '').trim() : ''
      }

      const missing = FIELDS.filter((f) => f.required && !normalized[f.key])

      if (missing.length > 0) {
        invalid.push({ rowNumber: i + 2, data: normalized, error: `Missing: ${missing.map((f) => f.label).join(', ')}` })
      } else {
        valid.push({ rowNumber: i + 2, data: normalized })
      }
    })

    return { validRows: valid, invalidRows: invalid }
  }, [csvRows, mapping])

  const requiredFieldsMapped = FIELDS.filter((f) => f.required).every((f) => mapping[f.key])

  async function handleSubmit() {
    setStep('progress')
    setProgress({ done: 0, total: validRows.length })
    setServerFailures([])
    setSuccessCount(0)
    await runChunks(validRows, 0)
    setStep('done')
  }

  async function runChunks(rowsToSend, baseSuccessCount) {
    let doneCount = 0
    let successTotal = baseSuccessCount
    const failures = []

    for (let start = 0; start < rowsToSend.length; start += CHUNK_SIZE) {
      const chunk = rowsToSend.slice(start, start + CHUNK_SIZE)
      try {
        const res = await fetch('/api/certificates/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ rows: chunk.map((r) => r.data) }),
        })
        const json = await res.json()

        if (!res.ok) {
          chunk.forEach((r) => failures.push({ rowNumber: r.rowNumber, data: r.data, error: json.error || 'Batch request failed.' }))
        } else {
          for (const result of json.results) {
            if (!result.success) {
              failures.push({ rowNumber: chunk[result.index].rowNumber, data: chunk[result.index].data, error: result.error })
            } else {
              successTotal++
            }
          }
        }
      } catch (err) {
        chunk.forEach((r) => failures.push({ rowNumber: r.rowNumber, data: r.data, error: err.message }))
      }

      doneCount += chunk.length
      setProgress({ done: doneCount, total: rowsToSend.length })
      setSuccessCount(successTotal)
      setServerFailures([...failures])
    }
  }

  async function handleRetryFailed() {
    const retryRows = serverFailures.map((f) => ({ rowNumber: f.rowNumber, data: f.data }))
    setStep('progress')
    setProgress({ done: 0, total: retryRows.length })
    setServerFailures([])
    await runChunks(retryRows, successCount)
    setStep('done')
  }

  function handleDone() {
    onComplete()
  }

  return (
    <Modal title="Batch Upload Certificates" onClose={onClose} maxWidth="max-w-2xl">
      {step === 'select' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">
            Upload a CSV with one row per earner. Required columns: Earner Name, Course/Program Title, Signatory
            Name, Signatory Title. Up to 500 rows per batch.
          </p>
          <button
            onClick={downloadSampleCsv}
            className="flex items-center gap-2 self-start text-sm text-[#B8962E] font-medium"
          >
            <Download size={14} />
            Download sample CSV
          </button>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 py-10 cursor-pointer hover:border-[#B8962E]">
            <Upload size={24} className="text-zinc-400" />
            <span className="text-sm text-zinc-500">{fileName || 'Click to select a CSV file'}</span>
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </label>
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}
        </div>
      )}

      {step === 'map' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">
            {csvRows.length} rows found in <span className="font-medium">{fileName}</span>. Match each field to a
            column from your CSV.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm text-zinc-700">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
                <select
                  value={mapping[field.key] || ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="border border-zinc-200 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">— none —</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {requiredFieldsMapped ? (
            <div className="rounded-md bg-zinc-50 border border-zinc-200 p-4 text-sm">
              <p className="flex items-center gap-2 text-green-700 font-medium">
                <CheckCircle2 size={16} />
                {validRows.length} row{validRows.length === 1 ? '' : 's'} ready to generate
              </p>
              {invalidRows.length > 0 && (
                <div className="mt-2 flex items-start gap-2 text-amber-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{invalidRows.length} row{invalidRows.length === 1 ? '' : 's'} will be skipped</p>
                    <ul className="mt-1 text-xs text-zinc-500 max-h-24 overflow-y-auto">
                      {invalidRows.slice(0, 10).map((r) => (
                        <li key={r.rowNumber}>Row {r.rowNumber}: {r.error}</li>
                      ))}
                      {invalidRows.length > 10 && <li>…and {invalidRows.length - 10} more</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-amber-700">Map all required fields (marked *) to continue.</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setStep('select')}
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!requiredFieldsMapped || validRows.length === 0}
              className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Generate {validRows.length} Certificate{validRows.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {step === 'progress' && (
        <div className="flex flex-col gap-4 py-6">
          <p className="text-sm text-zinc-600 text-center">
            Generating {progress.done} of {progress.total}…
          </p>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#B8962E] transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-zinc-400 text-center">Do not close this window.</p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-zinc-50 border border-zinc-200 p-4 text-sm">
            <p className="text-green-700 font-medium">{successCount} certificate{successCount === 1 ? '' : 's'} generated successfully</p>
            {(serverFailures.length + invalidRows.length) > 0 && (
              <p className="text-amber-700 mt-1">
                {serverFailures.length + invalidRows.length} row{(serverFailures.length + invalidRows.length) === 1 ? '' : 's'} failed
              </p>
            )}
          </div>

          {(serverFailures.length > 0 || invalidRows.length > 0) && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-200">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-400 uppercase text-left">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[...invalidRows, ...serverFailures].map((f) => (
                    <tr key={f.rowNumber}>
                      <td className="px-3 py-2">{f.rowNumber}</td>
                      <td className="px-3 py-2 text-red-600">{f.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {serverFailures.length > 0 && (
              <button
                onClick={handleRetryFailed}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Retry {serverFailures.length} Failed Row{serverFailures.length === 1 ? '' : 's'}
              </button>
            )}
            <button
              onClick={handleDone}
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
