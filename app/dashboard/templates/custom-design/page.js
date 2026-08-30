// ============================================================
// MARKSCERTIFY — Custom Design Editor (paid add-on)
// File: /app/dashboard/templates/custom-design/page.js
//
// Upload flow + drag/resize field-positioning editor for an
// institution's own certificate design. Positions are stored as
// percentages of the 297mm x 210mm canvas (see app/lib/templateOptions.js's
// sanitizeCustomDesignFields) so they render correctly both here (at
// whatever pixel size the browser gives this editor) and in the actual
// PDF (see certificateGenerator.js's buildCustomDesignHtml) — the
// container's rendered pixel size is only ever used to convert to/from
// those percentages, never stored directly.
// ============================================================

'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { Upload, X, Check, Loader2 } from 'lucide-react'
import { useSessionContext } from '../../SessionContext'
import {
  CUSTOM_DESIGN_FIELD_KEYS,
  REQUIRED_CUSTOM_DESIGN_FIELDS,
  FONT_OPTIONS,
  TEXT_ALIGN_OPTIONS,
} from '../../../lib/templateOptions'

const FIELD_LABELS = {
  EARNER_NAME: 'Earner Name',
  COURSE_TITLE: 'Course Title',
  ISSUE_DATE: 'Issue Date',
  EXPIRY_DATE: 'Expiry Date',
  SIGNATORY_NAME: 'Signatory Name',
  SIGNATORY_TITLE: 'Signatory Title',
  CERT_ID: 'Certificate ID',
  QR_CODE: 'Verify QR Code',
}

const SAMPLE_TEXT = {
  EARNER_NAME: 'Jane Doe',
  COURSE_TITLE: 'Sample Course Title',
  ISSUE_DATE: '1 January 2026',
  EXPIRY_DATE: '1 January 2027',
  SIGNATORY_NAME: 'Signatory Name',
  SIGNATORY_TITLE: 'Title',
  CERT_ID: 'MC-2026-NG-00001',
}

const DEFAULT_TEXT_FIELD = { xPercent: 35, yPercent: 45, widthPercent: 30, fontSize: 14, color: '#0D0D0D', fontFamily: 'georgia', align: 'center' }
const DEFAULT_QR_FIELD = { xPercent: 85, yPercent: 78, sizePercent: 10 }

export default function CustomDesignPage() {
  const { session } = useSessionContext()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [entitled, setEntitled] = useState(false)
  const [designUrl, setDesignUrl] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [fields, setFields] = useState({})

  const [selectedKey, setSelectedKey] = useState(null)
  const [openPicker, setOpenPicker] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveMessage, setSaveMessage] = useState(null)

  const containerRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    fetchState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Measure synchronously on mount (before paint) rather than relying only
  // on ResizeObserver's first callback — that first callback is only
  // guaranteed "soon after" observe() is called, not before paint, so field
  // boxes would otherwise be briefly invisible (containerSize.width === 0
  // gates their render below) every time this editor opens.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setContainerSize({ width: rect.width, height: rect.height })
  }, [designUrl])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [designUrl])

  function fetchState() {
    setLoading(true)
    setLoadError(null)
    fetch('/api/institution/custom-design/fields', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setEntitled(json.entitled)
        setDesignUrl(json.designUrl)
        setEnabled(json.enabled)
        setFields(json.fields || {})
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/institution/custom-design/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Upload failed.')
      setDesignUrl(json.url)
      setEnabled(false)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  function addField(key) {
    setFields((prev) => ({
      ...prev,
      [key]: key === 'QR_CODE' ? { ...DEFAULT_QR_FIELD } : { ...DEFAULT_TEXT_FIELD },
    }))
    setSelectedKey(key)
  }

  function updateField(key, patch) {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function removeField(key) {
    setFields((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (selectedKey === key) setSelectedKey(null)
  }

  function pxToPercent(px, axis) {
    const dimension = axis === 'x' ? containerSize.width : containerSize.height
    if (!dimension) return 0
    return Math.max(0, Math.min(100, (px / dimension) * 100))
  }

  async function persist(patch) {
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/institution/custom-design/fields', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fields, ...patch }),
      })
      const json = await res.json()
      if (!res.ok) {
        const detail = json.missing ? ` Missing: ${json.missing.map((k) => FIELD_LABELS[k]).join(', ')}.` : ''
        throw new Error((json.error || 'Failed to save.') + detail)
      }
      setFields(json.fields)
      setEnabled(json.enabled)
      setSaveMessage(patch.enabled === true ? 'Activated — live on new certificates.' : patch.enabled === false ? 'Deactivated.' : 'Draft saved.')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-zinc-400">Loading…</p>

  if (loadError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-red-600">{loadError}</p>
        <button onClick={fetchState} className="self-start rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
          Retry
        </button>
      </div>
    )
  }

  if (!entitled) {
    return (
      <div className="max-w-lg bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-base font-semibold text-zinc-900">Custom Design is a paid add-on</h2>
        <p className="text-sm text-zinc-500 mt-2">
          Upload your own certificate design and control exactly where each detail appears on it. Contact us to unlock this feature.
        </p>
        <a href="/dashboard/templates" className="inline-block mt-4 text-sm font-medium text-[#B8962E] hover:underline">
          ← Back to Templates
        </a>
      </div>
    )
  }

  const requiredMissing = REQUIRED_CUSTOM_DESIGN_FIELDS.filter((key) => !(key in fields))
  const unplacedKeys = CUSTOM_DESIGN_FIELD_KEYS.filter((key) => !(key in fields))
  const selectedField = selectedKey ? fields[selectedKey] : null

  return (
    <div className="flex flex-col gap-6">
      <a href="/dashboard/templates" className="text-sm text-zinc-500 hover:text-zinc-700 self-start">
        ← Back to Templates
      </a>

      {!designUrl ? (
        <div className="max-w-lg bg-white rounded-xl border border-dashed border-zinc-300 p-8 flex flex-col items-center gap-3 text-center">
          <Upload size={24} className="text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-900">Upload your certificate design</p>
            <p className="text-xs text-zinc-400 mt-1">PNG or JPEG, A4 landscape proportions (roughly 297×210mm), up to 8MB.</p>
          </div>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          <label className="mt-2 cursor-pointer rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white">
            {uploading ? 'Uploading…' : 'Choose File'}
            <input type="file" accept="image/png,image/jpeg" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Editor canvas */}
          <div className="flex-1 flex flex-col gap-3 max-w-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">Position Your Fields</h2>
              <label className="cursor-pointer text-xs font-medium text-[#B8962E] hover:underline">
                {uploading ? 'Uploading…' : 'Replace Design'}
                <input type="file" accept="image/png,image/jpeg" onChange={handleUpload} disabled={uploading} className="hidden" />
              </label>
            </div>
            {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

            <div
              ref={containerRef}
              className="relative w-full rounded-lg border border-zinc-200 overflow-hidden select-none"
              style={{
                aspectRatio: '297 / 210',
                backgroundImage: `url('${designUrl}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              // Deselect only when the click lands on the background itself —
              // clicking a field fires this same bubbled click too (stopping
              // propagation on mousedown doesn't stop the later click event),
              // so target-checking is what actually distinguishes the two.
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedKey(null)
              }}
            >
              {containerSize.width > 0 &&
                Object.entries(fields).map(([key, field]) => {
                  const isQr = key === 'QR_CODE'
                  const width = isQr ? (field.sizePercent / 100) * containerSize.width : (field.widthPercent / 100) * containerSize.width
                  const height = isQr ? width : 40
                  return (
                    <Rnd
                      key={key}
                      bounds="parent"
                      size={{ width, height }}
                      position={{ x: (field.xPercent / 100) * containerSize.width, y: (field.yPercent / 100) * containerSize.height }}
                      enableResizing={isQr ? { bottomRight: true } : { left: true, right: true }}
                      lockAspectRatio={isQr}
                      onDragStop={(e, d) => {
                        updateField(key, { xPercent: pxToPercent(d.x, 'x'), yPercent: pxToPercent(d.y, 'y') })
                      }}
                      onResizeStop={(e, dir, ref, delta, position) => {
                        const patch = { xPercent: pxToPercent(position.x, 'x'), yPercent: pxToPercent(position.y, 'y') }
                        if (isQr) patch.sizePercent = pxToPercent(ref.offsetWidth, 'x')
                        else patch.widthPercent = pxToPercent(ref.offsetWidth, 'x')
                        updateField(key, patch)
                      }}
                      onMouseDown={(e) => { e.stopPropagation(); setSelectedKey(key) }}
                      className={`flex items-center justify-center border-2 ${selectedKey === key ? 'border-[#B8962E]' : 'border-[#B8962E]/40'} bg-black/10`}
                    >
                      {isQr ? (
                        <span className="text-[10px] text-white bg-black/50 px-1 rounded">QR</span>
                      ) : (
                        <span
                          className="w-full truncate px-1 text-xs"
                          style={{ color: field.color, fontFamily: FONT_OPTIONS.find((f) => f.key === field.fontFamily)?.cssFamily, textAlign: field.align }}
                        >
                          {SAMPLE_TEXT[key]}
                        </span>
                      )}
                    </Rnd>
                  )
                })}
            </div>

            {unplacedKeys.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-zinc-500">Add a field</p>
                <div className="flex flex-wrap gap-2">
                  {unplacedKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => addField(key)}
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-[#B8962E] hover:text-[#B8962E]"
                    >
                      + {FIELD_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-zinc-200 p-4 flex flex-col gap-2">
              <p className="text-xs font-medium text-zinc-500">Required before activating</p>
              {REQUIRED_CUSTOM_DESIGN_FIELDS.map((key) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  {key in fields ? <Check size={14} className="text-green-600" /> : <X size={14} className="text-zinc-300" />}
                  <span className={key in fields ? 'text-zinc-700' : 'text-zinc-400'}>{FIELD_LABELS[key]}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => persist({})}
                disabled={saving}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save Draft'}
              </button>
              {enabled ? (
                <button
                  type="button"
                  onClick={() => persist({ enabled: false })}
                  disabled={saving}
                  className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => persist({ enabled: true })}
                  disabled={saving || requiredMissing.length > 0}
                  title={requiredMissing.length > 0 ? `Missing: ${requiredMissing.map((k) => FIELD_LABELS[k]).join(', ')}` : undefined}
                  className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Activate
                </button>
              )}
              {saveMessage && <p className="text-sm text-green-700">{saveMessage}</p>}
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>
          </div>

          {/* Style panel for the selected field */}
          <div className="w-full lg:w-72 shrink-0">
            {!selectedKey || !selectedField ? (
              <p className="text-sm text-zinc-400">Click a field on the design to edit its style, or add a new one.</p>
            ) : (
              <div className="bg-white rounded-xl border border-zinc-200 p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900">{FIELD_LABELS[selectedKey]}</h3>
                  <button type="button" onClick={() => removeField(selectedKey)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>

                {selectedKey === 'QR_CODE' ? (
                  <p className="text-xs text-zinc-400">Drag to move, drag the corner to resize.</p>
                ) : (
                  <>
                    <label className="flex flex-col gap-1 text-xs text-zinc-600">
                      Font size (pt)
                      <input
                        type="number"
                        min={4}
                        max={72}
                        value={selectedField.fontSize}
                        onChange={(e) => updateField(selectedKey, { fontSize: Number(e.target.value) })}
                        className="border border-zinc-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-[#B8962E]"
                      />
                    </label>

                    <div className="flex flex-col gap-1 relative">
                      <span className="text-xs text-zinc-600">Color</span>
                      <button
                        type="button"
                        onClick={() => setOpenPicker((v) => !v)}
                        className="flex items-center gap-2 border border-zinc-200 rounded-md px-3 py-2 text-sm hover:border-zinc-300"
                      >
                        <span className="h-4 w-4 rounded-full border border-zinc-200" style={{ backgroundColor: selectedField.color }} />
                        {selectedField.color.toUpperCase()}
                      </button>
                      {openPicker && (
                        <>
                          <div className="fixed inset-0 z-[5]" onClick={() => setOpenPicker(false)} />
                          <div className="absolute top-full left-0 z-10 mt-2 bg-white rounded-lg border border-zinc-200 p-3 shadow-lg">
                            <HexColorPicker color={selectedField.color} onChange={(color) => updateField(selectedKey, { color })} />
                            <HexColorInput
                              color={selectedField.color}
                              onChange={(color) => updateField(selectedKey, { color })}
                              prefixed
                              className="mt-2 w-full border border-zinc-200 rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:border-[#B8962E]"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600">Font</span>
                      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                        {FONT_OPTIONS.map((font) => (
                          <button
                            key={font.key}
                            type="button"
                            onClick={() => updateField(selectedKey, { fontFamily: font.key })}
                            style={{ fontFamily: font.cssFamily }}
                            className={`text-left rounded-md border px-2 py-1 text-sm ${
                              selectedField.fontFamily === font.key ? 'border-[#B8962E] bg-[#B8962E]/5' : 'border-zinc-200'
                            }`}
                          >
                            {font.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600">Align</span>
                      <div className="flex gap-1">
                        {TEXT_ALIGN_OPTIONS.map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => updateField(selectedKey, { align })}
                            className={`flex-1 rounded-md border px-2 py-1 text-xs capitalize ${
                              selectedField.align === align ? 'border-[#B8962E] text-[#B8962E]' : 'border-zinc-200 text-zinc-500'
                            }`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
