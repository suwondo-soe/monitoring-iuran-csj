import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Check, Home, Plus, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import {
  loadHouseholdStatistics,
  loadHouseholdStatuses,
  loadHouseholdSubmission,
  saveHouseholdSubmission,
  uploadHouseholdKK,
} from './lib/householdMembers'
import type {
  HouseholdAccount,
  HouseholdMember,
  HouseholdRelationship,
  HouseholdStatistic,
  HouseholdSubmissionStatus,
} from './householdTypes'
import './HouseholdMembers.css'

const relationships: HouseholdRelationship[] = [
  'Kepala Keluarga', 'Istri', 'Anak', 'Cucu', 'Orang Tua', 'Mertua', 'Lainnya',
]

const statisticCategories = [
  ['gender', 'Jenis Kelamin'],
  ['age', 'Usia'],
  ['relationship', 'Hubungan Keluarga'],
  ['family_card', 'Keanggotaan KK'],
  ['residence', 'Tinggal di Rumah'],
] as const

const emptyMember = (): HouseholdMember => ({
  id: crypto.randomUUID(), name: '', gender: '', relationship: '', birthDate: '',
  inFamilyCard: null, livesInHouse: null,
})

const minimumRows = (members: HouseholdMember[]) => {
  const rows = [...members]
  while (rows.length < 2) rows.push(emptyMember())
  return rows
}

const titleCaseName = (value: string) => value
  .toLocaleLowerCase('id-ID')
  .replace(/(^|[\s.'-])\p{L}/gu, (character) => character.toLocaleUpperCase('id-ID'))

const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Terjadi kesalahan. Silakan coba kembali.'

function YesNo({ value, onChange }: { value: boolean | null, onChange: (value: boolean) => void }) {
  return <div className="household-boolean" role="group" aria-label="Pilih Ya atau Tidak">
    <button className={value === true ? 'active yes' : ''} onClick={() => onChange(true)} type="button">Ya</button>
    <button className={value === false ? 'active no' : ''} onClick={() => onChange(false)} type="button">Tidak</button>
  </div>
}

function HouseholdStatistics({ rows }: { rows: HouseholdStatistic[] }) {
  const [category, setCategory] = useState<(typeof statisticCategories)[number][0]>('gender')
  const summary = new Map(rows.filter((row) => row.category === 'summary').map((row) => [row.label, row.total]))
  const chartRows = rows.filter((row) => row.category === category)
  const maximum = Math.max(...chartRows.map((row) => row.total), 1)
  return <section className="panel household-statistics">
    <div className="household-stat-heading"><div><span>Statistik warga</span><h2>Rangkuman Household Member</h2><p>Hanya angka agregat yang ditampilkan. Nama, tanggal lahir, dan dokumen KK tetap bersifat privat.</p></div><div className="household-stat-icon"><BarChart3 size={26} /></div></div>
    <div className="household-summary-cards">
      <article><Users size={20} /><span>Total anggota keluarga tercatat</span><strong>{summary.get('Total anggota tercatat') ?? 0}</strong></article>
      <article><Home size={20} /><span>Tinggal bersama di rumah</span><strong>{summary.get('Tinggal bersama di rumah') ?? 0}</strong></article>
      <article><Check size={20} /><span>Rumah sudah mengisi</span><strong>{summary.get('Rumah sudah mengisi') ?? 0}</strong></article>
    </div>
    <div className="household-chart-controls" aria-label="Pilih kategori statistik">{statisticCategories.map(([value, label]) => <button className={category === value ? 'active' : ''} key={value} onClick={() => setCategory(value)} type="button">{label}</button>)}</div>
    <div className="household-bar-chart">{chartRows.length ? chartRows.map((row, index) => <div className="household-bar-row" key={row.label}><div><span>{row.label}</span><strong>{row.total}</strong></div><div className="household-bar-track"><i style={{ width: `${Math.max(row.total / maximum * 100, 4)}%`, animationDelay: `${index * 60}ms` }} /></div></div>) : <div className="household-chart-empty">Belum ada data untuk kategori ini.</div>}</div>
  </section>
}

export default function HouseholdMembersPage({ accounts }: { accounts: HouseholdAccount[] }) {
  const [statuses, setStatuses] = useState<HouseholdSubmissionStatus[]>([])
  const [statistics, setStatistics] = useState<HouseholdStatistic[]>([])
  const [selectedHouseId, setSelectedHouseId] = useState(accounts[0]?.houseId ?? 0)
  const [members, setMembers] = useState<HouseholdMember[]>(minimumRows([]))
  const [mode, setMode] = useState<'closed' | 'new' | 'unlock' | 'edit'>('closed')
  const [editCode, setEditCode] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [kkFile, setKkFile] = useState<File | null>(null)
  const [storedKkName, setStoredKkName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedAccount = accounts.find((account) => account.houseId === selectedHouseId) ?? accounts[0]
  const statusMap = useMemo(() => new Map(statuses.map((status) => [status.houseId, status])), [statuses])

  const refresh = async () => {
    const [nextStatuses, nextStatistics] = await Promise.all([loadHouseholdStatuses(), loadHouseholdStatistics()])
    setStatuses(nextStatuses); setStatistics(nextStatistics)
  }

  // Initial loading synchronizes this standalone module with Supabase/local storage.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void refresh().catch((reason) => setError(message(reason))) }, [])

  const resetForm = () => {
    setMembers(minimumRows([])); setEditCode(''); setConfirmCode(''); setKkFile(null)
    setStoredKkName(''); setError(''); setNotice('')
  }

  const openAccount = (account: HouseholdAccount) => {
    setSelectedHouseId(account.houseId); resetForm()
    setMode(statusMap.has(account.houseId) ? 'unlock' : 'new')
  }

  const unlock = async () => {
    if (!selectedAccount || !/^\d{6}$/.test(editCode)) { setError('Masukkan kode pembaruan 6 digit.'); return }
    setBusy(true); setError('')
    try {
      const submission = await loadHouseholdSubmission(selectedAccount.houseId, selectedAccount.residentName, editCode)
      setMembers(minimumRows(submission.members)); setStoredKkName(submission.kkName); setMode('edit')
      setNotice('Data berhasil dibuka. Silakan lakukan pembaruan jika diperlukan.')
    } catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }

  const updateMember = (id: string, patch: Partial<HouseholdMember>) =>
    setMembers((current) => current.map((member) => member.id === id ? { ...member, ...patch } : member))

  const removeMember = (id: string) => setMembers((current) => minimumRows(current.filter((member) => member.id !== id)))

  const submit = async () => {
    if (!selectedAccount) return
    const filledMembers = members.filter((member) => member.name.trim())
      .map((member) => ({ ...member, name: titleCaseName(member.name.trim()) }))
    if (!/^\d{6}$/.test(editCode)) { setError('Kode pembaruan harus terdiri dari 6 angka.'); return }
    if (mode === 'new' && editCode !== confirmCode) { setError('Konfirmasi kode pembaruan tidak sesuai.'); return }
    if (!filledMembers.length) { setError('Isi minimal satu anggota keluarga.'); return }
    if (filledMembers.some((member) => !member.gender || !member.relationship || !member.birthDate || member.inFamilyCard === null || member.livesInHouse === null)) {
      setError('Lengkapi seluruh kolom pada setiap anggota yang namanya sudah diisi.'); return
    }
    if (filledMembers.some((member) => member.birthDate > new Date().toLocaleDateString('sv-SE'))) { setError('Tanggal lahir tidak boleh berada di masa depan.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const kkPath = kkFile ? await uploadHouseholdKK(selectedAccount.houseId, kkFile) : undefined
      await saveHouseholdSubmission({
        houseId: selectedAccount.houseId, residentName: selectedAccount.residentName,
        editCode, members: filledMembers, kkPath, kkName: kkFile?.name,
      })
      await refresh()
      resetForm(); setMode('closed')
      setNotice('Data household member berhasil disimpan. Kotak rumah sekarang berwarna hijau.')
    } catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }

  return <div className="page-stack household-page">
    <section className="household-hero">
      <div><span>Pendataan warga</span><h2>Household Member</h2><p>Form ini hanya digunakan untuk mencatat anggota keluarga yang tercantum dalam Kartu Keluarga dan/atau orang yang tidak termasuk dalam KK tetapi tinggal bersama di rumah.</p></div>
      <div><ShieldCheck size={24} /><strong>Data privat</strong><small>Detail hanya dapat dibuka dengan kode pembaruan dan oleh admin.</small></div>
    </section>

    <section className="panel household-selector-panel">
      <div className="panel-title"><div><span>Status pengisian</span><h3>Pilih Nomor Rumah</h3><p>Hijau berarti data sudah tersimpan; merah berarti belum diisi.</p></div><div className="household-legend"><span><i className="filled" />Sudah diisi</span><span><i className="empty" />Belum diisi</span></div></div>
      <div className="household-house-grid">{accounts.map((account) => { const filled = statusMap.has(account.houseId); return <button className={`${filled ? 'filled' : 'empty'} ${selectedHouseId === account.houseId && mode !== 'closed' ? 'selected' : ''}`} key={account.houseId} onClick={() => openAccount(account)} type="button"><strong>{account.shortCode}</strong><span>{filled ? <><Check size={12} />Sudah diisi</> : <><X size={12} />Belum</>}</span></button> })}</div>
      <div className="household-dropdown"><label>Nomor rumah dan penghuni aktif<select value={selectedHouseId} onChange={(event) => setSelectedHouseId(Number(event.target.value))}>{accounts.map((account) => <option key={account.houseId} value={account.houseId}>{account.code} · {account.residentName}</option>)}</select></label><button className="primary-action" onClick={() => selectedAccount && openAccount(selectedAccount)} type="button">Buka Form</button></div>
      {mode === 'closed' && notice && <p className="household-message success">{notice}</p>}
    </section>

    {mode === 'unlock' && selectedAccount && <section className="panel household-unlock">
      <div><span>Data sudah tersimpan</span><h3>{selectedAccount.code} · {selectedAccount.residentName}</h3><p>Masukkan kode pembaruan 6 digit yang dibuat saat pengisian pertama untuk membuka dan memperbarui data.</p></div>
      <label>Kode pembaruan<input inputMode="numeric" maxLength={6} placeholder="6 digit" value={editCode} onChange={(event) => setEditCode(event.target.value.replace(/\D/g, ''))} /></label>
      <button className="primary-action" disabled={busy} onClick={() => void unlock()} type="button">{busy ? 'Membuka…' : 'Buka data'}</button>
      {error && <p className="household-message error">{error}</p>}
    </section>}

    {(mode === 'new' || mode === 'edit') && selectedAccount && <section className="panel household-form-panel">
      <div className="household-form-heading"><div><span>{mode === 'new' ? 'Pengisian baru' : 'Pembaruan data'}</span><h3>{selectedAccount.code} · {selectedAccount.residentName}</h3><p>Tambahkan satu baris untuk setiap anggota keluarga atau orang lain yang tinggal bersama.</p></div><button className="secondary-action" onClick={() => setMembers((current) => [...current, emptyMember()])} type="button"><Plus size={16} />Tambah baris</button></div>
      <div className="household-member-table-wrap"><table className="household-member-table"><thead><tr><th>No.</th><th>Nama</th><th>Jenis Kelamin</th><th>Hubungan Keluarga</th><th>Tanggal Lahir</th><th>Anggota KK</th><th>Tinggal di Rumah</th><th /></tr></thead><tbody>{members.map((member, index) => <tr key={member.id}><td><strong>{index + 1}</strong></td><td><input aria-label={`Nama anggota ${index + 1}`} placeholder="Nama lengkap" value={member.name} onBlur={() => updateMember(member.id, { name: titleCaseName(member.name) })} onChange={(event) => updateMember(member.id, { name: event.target.value })} /></td><td><select aria-label={`Jenis kelamin anggota ${index + 1}`} value={member.gender} onChange={(event) => updateMember(member.id, { gender: event.target.value as HouseholdMember['gender'] })}><option value="">Pilih</option><option value="male">Laki-laki</option><option value="female">Perempuan</option></select></td><td><select aria-label={`Hubungan keluarga anggota ${index + 1}`} value={member.relationship} onChange={(event) => updateMember(member.id, { relationship: event.target.value as HouseholdMember['relationship'] })}><option value="">Pilih</option>{relationships.map((relationship) => <option key={relationship}>{relationship}</option>)}</select></td><td><input aria-label={`Tanggal lahir anggota ${index + 1}`} type="date" max={new Date().toLocaleDateString('sv-SE')} value={member.birthDate} onChange={(event) => updateMember(member.id, { birthDate: event.target.value })} /></td><td><YesNo value={member.inFamilyCard} onChange={(value) => updateMember(member.id, { inFamilyCard: value })} /></td><td><YesNo value={member.livesInHouse} onChange={(value) => updateMember(member.id, { livesInHouse: value })} /></td><td><button className="household-delete-row" aria-label={`Hapus baris ${index + 1}`} onClick={() => removeMember(member.id)} type="button"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
      <div className="household-save-grid">
        <label className="household-kk-field">Kartu Keluarga (opsional)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setKkFile(event.target.files?.[0] ?? null)} /><small>PDF/JPG/PNG · maks. 5 MB.{storedKkName ? ` Tersimpan: ${storedKkName}` : ''}</small></label>
        <label>PIN pembaruan 6 digit<input inputMode="numeric" maxLength={6} placeholder="Contoh: 123456" value={editCode} onChange={(event) => setEditCode(event.target.value.replace(/\D/g, ''))} /><small>Simpan PIN untuk pembaruan berikutnya.</small></label>
        {mode === 'new' && <label>Konfirmasi PIN<input inputMode="numeric" maxLength={6} placeholder="Ulangi 6 digit" value={confirmCode} onChange={(event) => setConfirmCode(event.target.value.replace(/\D/g, ''))} /><small>Masukkan kembali PIN yang sama.</small></label>}
        <button className="primary-action household-save-button" disabled={busy} onClick={() => void submit()} type="button">{busy ? 'Menyimpan…' : 'Save'}</button>
      </div>
      {error && <p className="household-message error">{error}</p>}{notice && <p className="household-message success">{notice}</p>}
    </section>}

    <HouseholdStatistics rows={statistics} />
  </div>
}
