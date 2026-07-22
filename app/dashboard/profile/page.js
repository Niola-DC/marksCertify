// ============================================================
// MARKSCERTIFY — Institution Profile
// File: /app/dashboard/profile/page.js
//
// View/edit-toggle profile: name, plan, contact details, social
// links, plus branding (logo + signature — the signature is
// embedded on every certificate, see lib/certificateGenerator.js).
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, PenTool, Loader2, Link2, Globe, Pencil } from 'lucide-react'
import { useSessionContext } from '../SessionContext'

const emptyForm = {
  name: '',
  location: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  instagramUrl: '',
  twitterUrl: '',
  linkedinUrl: '',
  defaultSignatoryName: '',
  defaultSignatoryTitle: '',
}

export default function ProfilePage() {
  const { session } = useSessionContext()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [logoUploading, setLogoUploading] = useState(false)
  const [signatureUploading, setSignatureUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  useEffect(() => {
    fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function fetchProfile() {
    setLoading(true)
    fetch('/api/institution/profile', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.detail ? `${json.error} ${json.detail}` : json.error)
        applyProfile(json.institution)
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }

  function applyProfile(institution) {
    setProfile(institution)
    setForm({
      name: institution.name || '',
      location: institution.location || '',
      contactEmail: institution.contactEmail || '',
      contactPhone: institution.contactPhone || '',
      website: institution.website || '',
      instagramUrl: institution.instagramUrl || '',
      twitterUrl: institution.twitterUrl || '',
      linkedinUrl: institution.linkedinUrl || '',
      defaultSignatoryName: institution.defaultSignatoryName || '',
      defaultSignatoryTitle: institution.defaultSignatoryTitle || '',
    })
  }

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  function handleEditToggle() {
    setSaveError(null)
    setEditing(true)
  }

  function handleCancel() {
    applyProfile(profile)
    setSaveError(null)
    setEditing(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)

    try {
      const res = await fetch('/api/institution/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save changes.')
      applyProfile(json.institution)
      setEditing(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(type, file) {
    const setUploading = type === 'logo' ? setLogoUploading : setSignatureUploading
    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('file', file)

      const res = await fetch('/api/institution/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed.')

      setProfile((prev) => ({
        ...prev,
        [type === 'logo' ? 'logoUrl' : 'signatureUrl']: json.url,
      }))
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading profile…</p>
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-red-600">{loadError || 'Failed to load profile.'}</p>
        <button
          onClick={fetchProfile}
          className="self-start rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Institution Profile</h2>
          {!editing ? (
            <button
              type="button"
              onClick={handleEditToggle}
              className="flex items-center gap-2 rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              <Pencil size={14} />
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ViewField label="Institution Name" required value={form.name} editing={editing} onChange={update('name')} />
          <div className="flex flex-col gap-1 text-sm text-zinc-700">
            <span>Plan</span>
            <div className="flex items-center h-[38px]">
              <span className="inline-block rounded-full bg-[#B8962E]/10 px-3 py-1 text-xs font-semibold capitalize text-[#B8962E]">
                {profile.planTier}
              </span>
            </div>
          </div>

          <ViewField label="Location / Address" value={form.location} editing={editing} onChange={update('location')} textarea placeholder="e.g. 12 Admiralty Way, Lekki, Lagos" className="sm:col-span-2" />

          <ViewField label="Contact Phone" value={form.contactPhone} editing={editing} onChange={update('contactPhone')} />
          <ViewField label="Contact Email" type="email" value={form.contactEmail} editing={editing} onChange={update('contactEmail')} />

          <ViewField label="Website" value={form.website} editing={editing} onChange={update('website')} placeholder="https://" icon={Globe} className="sm:col-span-2" />
        </div>

        <div className="border-t border-zinc-100 pt-4">
          <p className="text-sm font-medium text-zinc-700 mb-3">Social Media Links</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ViewField label="Instagram" value={form.instagramUrl} editing={editing} onChange={update('instagramUrl')} icon={Link2} />
            <ViewField label="Twitter / X" value={form.twitterUrl} editing={editing} onChange={update('twitterUrl')} icon={Link2} />
            <ViewField label="LinkedIn" value={form.linkedinUrl} editing={editing} onChange={update('linkedinUrl')} icon={Link2} />
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-4">
          <p className="text-sm font-medium text-zinc-700 mb-1">Default Signatory</p>
          <p className="text-xs text-zinc-400 mb-3">
            Pre-fills the signatory fields when you generate certificates — you can still change it per certificate.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ViewField label="Signatory Name" value={form.defaultSignatoryName} editing={editing} onChange={update('defaultSignatoryName')} placeholder="e.g. Eniola Chinemerem" />
            <ViewField label="Signatory Title" value={form.defaultSignatoryTitle} editing={editing} onChange={update('defaultSignatoryTitle')} placeholder="e.g. Founder" />
          </div>
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      </form>

      {/* Branding */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Branding</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Your signature is embedded on every certificate you issue. PNG, JPEG, or WEBP — under 2MB. A
            transparent PNG works best.
          </p>
        </div>

        {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ImageUploadTile
            label="Institution Logo"
            icon={ImageIcon}
            imageUrl={profile.logoUrl}
            uploading={logoUploading}
            onSelect={(file) => handleUpload('logo', file)}
          />
          <ImageUploadTile
            label="Signatory Signature"
            icon={PenTool}
            imageUrl={profile.signatureUrl}
            uploading={signatureUploading}
            dark
            onSelect={(file) => handleUpload('signature', file)}
          />
        </div>
      </div>
    </div>
  )
}

// Renders as a disabled, greyed-out field in view mode and a normal
// editable field once "Edit Profile" is clicked — mirrors the
// reference design's view/edit pattern.
function ViewField({ label, value, editing, onChange, required, type = 'text', textarea, placeholder, icon: Icon, hideLabel, className = '' }) {
  const baseClasses = `border rounded-md px-3 py-2 text-sm focus:outline-none ${
    editing
      ? 'border-zinc-200 text-zinc-900 focus:border-[#B8962E] bg-white'
      : 'border-zinc-100 text-zinc-500 bg-zinc-50 cursor-default'
  } ${Icon ? 'pl-9' : ''}`

  return (
    <label className={`flex flex-col gap-1 text-sm text-zinc-700 ${className}`}>
      {!hideLabel && (
        <span>
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      <div className="relative">
        {Icon && <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />}
        {textarea ? (
          <textarea
            value={value}
            onChange={onChange}
            disabled={!editing}
            placeholder={editing ? placeholder : ''}
            rows={2}
            className={`w-full resize-none ${baseClasses}`}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={onChange}
            disabled={!editing}
            placeholder={editing ? (placeholder || label) : ''}
            className={`w-full ${baseClasses}`}
          />
        )}
      </div>
      {!editing && !value && <span className="text-xs text-zinc-300">Not set</span>}
    </label>
  )
}

function ImageUploadTile({ label, icon: Icon, imageUrl, uploading, dark, onSelect }) {
  const inputRef = useRef(null)

  function handleChange(e) {
    const file = e.target.files?.[0]
    if (file) onSelect(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-zinc-700">{label}</p>
      <div
        className={`h-28 rounded-lg border border-dashed border-zinc-200 flex items-center justify-center overflow-hidden ${dark ? 'bg-[#0D0D0D]' : 'bg-zinc-50'}`}
      >
        {uploading ? (
          <Loader2 size={20} className="animate-spin text-zinc-400" />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={label} className="max-h-full max-w-full object-contain p-3" />
        ) : (
          <Icon size={22} className="text-zinc-300" />
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="self-start text-xs font-medium text-[#B8962E] disabled:opacity-50"
      >
        {imageUrl ? 'Replace' : 'Upload'}
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleChange} className="hidden" />
    </div>
  )
}
