// ============================================================
// MARKSCERTIFY — Template Builder
// File: /app/dashboard/templates/page.js
//
// Lets an institution customize its certificate's border style,
// colors, and font. Saved config is applied to every certificate
// generated from then on (see app/lib/certificateGenerator.js).
// Logo/signature stay on the Profile page — this page is about
// styling, not asset management.
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { Lock, Upload, PenLine } from 'lucide-react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useSessionContext } from '../SessionContext'
import CertificatePreview from './CertificatePreview'
import { BASE_STYLES, FONT_OPTIONS, DEFAULT_TEMPLATE_CONFIG } from '../../lib/templateOptions'

const STYLE_LABELS = {
  classic: 'Classic',
  'modern-minimal': 'Modern Minimal',
  ornate: 'Ornate',
  'bold-frame': 'Bold Frame',
  'clean-line': 'Clean Line',
}

export default function TemplatesPage() {
  const { session } = useSessionContext()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(DEFAULT_TEMPLATE_CONFIG)
  const [branding, setBranding] = useState({
    name: '',
    logoUrl: null,
    signatureUrl: null,
    defaultSignatoryName: '',
    defaultSignatoryTitle: '',
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveMessage, setSaveMessage] = useState(null)

  const [openPicker, setOpenPicker] = useState(null) // 'primary' | 'secondary' | null

  const [customDesign, setCustomDesign] = useState({ entitled: false, designUrl: null, enabled: false })

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function fetchAll() {
    setLoading(true)
    setLoadError(null)
    const headers = { Authorization: `Bearer ${session.access_token}` }
    Promise.all([
      fetch('/api/institution/template', { headers }).then((res) => res.json()),
      fetch('/api/institution/profile', { headers }).then((res) => res.json()),
      fetch('/api/institution/custom-design/fields', { headers }).then((res) => res.json()),
    ])
      .then(([templateJson, profileJson, customDesignJson]) => {
        if (templateJson.error) {
          throw new Error(templateJson.detail ? `${templateJson.error} ${templateJson.detail}` : templateJson.error)
        }
        if (profileJson.error) {
          throw new Error(profileJson.detail ? `${profileJson.error} ${profileJson.detail}` : profileJson.error)
        }
        setForm(templateJson.templateConfig)
        setBranding({
          name: profileJson.institution.name,
          logoUrl: profileJson.institution.logoUrl,
          signatureUrl: profileJson.institution.signatureUrl,
          defaultSignatoryName: profileJson.institution.defaultSignatoryName,
          defaultSignatoryTitle: profileJson.institution.defaultSignatoryTitle,
        })
        // Custom design state failing to load isn't fatal to the rest of
        // the page — fall back to "not entitled" rather than blocking the
        // whole Templates page on this one extra fetch.
        if (!customDesignJson.error) {
          setCustomDesign({
            entitled: customDesignJson.entitled,
            designUrl: customDesignJson.designUrl,
            enabled: customDesignJson.enabled,
          })
        }
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }

  function update(field) {
    return (value) => setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/institution/template', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save template.')
      setForm(json.templateConfig)
      setSaveMessage('Saved.')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading templates…</p>
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          onClick={fetchAll}
          className="self-start rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 flex flex-col gap-6 max-w-xl">
        <CustomDesignCard customDesign={customDesign} />

        {/* Border style — horizontal scroll rather than a wrapping grid, so
            each choice keeps a comfortable tap target and readable label
            on narrow screens instead of being squeezed into 3 columns. */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-zinc-900">Border Style</h2>
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-1">
            {BASE_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => update('baseStyle')(style)}
                className={`shrink-0 w-24 snap-start rounded-lg border-2 p-2 text-xs font-medium text-center transition-colors ${
                  form.baseStyle === style
                    ? 'border-[#B8962E] text-[#B8962E]'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                <StylePreviewThumb style={style} active={form.baseStyle === style} />
                {STYLE_LABELS[style]}
              </button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-zinc-900">Colors</h2>
          <div className="grid grid-cols-2 gap-6">
            <ColorField
              label="Primary (accent)"
              value={form.primaryColor}
              onChange={update('primaryColor')}
              open={openPicker === 'primary'}
              onToggle={() => setOpenPicker(openPicker === 'primary' ? null : 'primary')}
            />
            <ColorField
              label="Secondary (background)"
              value={form.secondaryColor}
              onChange={update('secondaryColor')}
              open={openPicker === 'secondary'}
              onToggle={() => setOpenPicker(openPicker === 'secondary' ? null : 'secondary')}
            />
          </div>
        </div>

        {/* Font */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-zinc-900">Font</h2>
          <div className="flex flex-col gap-2">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.key}
                type="button"
                onClick={() => update('fontFamily')(font.key)}
                style={{ fontFamily: font.cssFamily }}
                className={`text-left rounded-md border px-4 py-2 text-lg transition-colors ${
                  form.fontFamily === font.key
                    ? 'border-[#B8962E] bg-[#B8962E]/5'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Template'}
          </button>
          {saveMessage && <p className="text-sm text-green-700">{saveMessage}</p>}
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </div>

        <p className="text-xs text-zinc-400">
          Logo and signature are managed on the{' '}
          <a href="/dashboard/profile" className="text-[#B8962E] font-medium hover:underline">
            Profile
          </a>{' '}
          page.
        </p>
      </div>

      {/* Live preview */}
      <div className="flex-1 flex flex-col gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Live Preview</h2>
        <CertificatePreview
          templateConfig={form}
          institutionName={branding.name}
          logoUrl={branding.logoUrl}
          signatureUrl={branding.signatureUrl}
          signatoryName={branding.defaultSignatoryName || 'Signatory Name'}
          signatoryTitle={branding.defaultSignatoryTitle || 'Title'}
        />
      </div>
    </div>
  )
}

// Paid add-on (PRD §6.2 "Custom-branded templates") — no Paystack billing
// exists yet, so entitlement is toggled manually in the DB for now; this
// card just reflects whatever GET /api/institution/custom-design/fields
// reports (see fetchAll above).
function CustomDesignCard({ customDesign }) {
  if (!customDesign.entitled) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-zinc-200 p-6 flex items-center gap-4 opacity-70">
        <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center">
          <Lock size={18} className="text-zinc-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Upload Your Own Design</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Use your exact certificate design from Canva, Photoshop, or anywhere else — available as a paid add-on. Contact us to unlock it.
          </p>
        </div>
      </div>
    )
  }

  const hasDesign = Boolean(customDesign.designUrl)

  return (
    <a
      href="/dashboard/templates/custom-design"
      className="bg-white rounded-xl border border-zinc-200 p-6 flex items-center gap-4 hover:border-[#B8962E] transition-colors"
    >
      <div className="h-10 w-10 shrink-0 rounded-full bg-[#B8962E]/10 flex items-center justify-center">
        {hasDesign ? <PenLine size={18} className="text-[#B8962E]" /> : <Upload size={18} className="text-[#B8962E]" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-zinc-900">Custom Design</h2>
          {hasDesign && (
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                customDesign.enabled ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              {customDesign.enabled ? 'Live' : 'Draft'}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500 mt-0.5">
          {hasDesign
            ? 'Edit your uploaded design and field positions.'
            : 'Upload your own certificate design and position the details on top of it.'}
        </p>
      </div>
    </a>
  )
}

function ColorField({ label, value, onChange, open, onToggle }) {
  return (
    <div className="flex flex-col gap-2 relative">
      <span className="text-sm text-zinc-700">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-900 hover:border-zinc-300"
      >
        <span className="h-5 w-5 rounded-full border border-zinc-200" style={{ backgroundColor: value }} />
        {value.toUpperCase()}
      </button>
      {open && (
        <>
          {/* Invisible full-screen backdrop — closes the popover on outside
              click so it can never sit indefinitely on top of content
              below it (e.g. the Font section), which is what "open a
              color picker and other controls disappear" looks like. */}
          <div className="fixed inset-0 z-[5]" onClick={onToggle} />
          <div className="absolute top-full left-0 z-10 mt-2 bg-white rounded-lg border border-zinc-200 p-3 shadow-lg">
            <HexColorPicker color={value} onChange={onChange} />
            <HexColorInput
              color={value}
              onChange={onChange}
              prefixed
              className="mt-2 w-full border border-zinc-200 rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:border-[#B8962E]"
            />
          </div>
        </>
      )}
    </div>
  )
}

// Longhand border* properties throughout (never mixed with the `border`
// shorthand) — React warns when an inline style alternates between
// shorthand and longhand for the same property across rerenders, since
// the two don't merge cleanly in the underlying style object.
function StylePreviewThumb({ style, active }) {
  const color = active ? '#B8962E' : '#a1a1aa'
  const thumbStyle = {
    classic: { borderStyle: 'double', borderWidth: '3px', borderColor: color },
    'modern-minimal': { borderStyle: 'solid', borderWidth: '1px', borderColor: color },
    ornate: { borderStyle: 'double', borderWidth: '4px', borderColor: color },
    'bold-frame': { borderStyle: 'solid', borderWidth: '3px', borderColor: color },
    'clean-line': { borderStyle: 'solid', borderWidth: '0 0 1px 0', borderColor: color },
  }[style]

  return <div className="mb-1 h-8 w-full rounded bg-zinc-50" style={thumbStyle} />
}
