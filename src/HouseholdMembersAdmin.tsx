import { useEffect, useMemo, useState } from 'react'
import { FileText, Home, Users } from 'lucide-react'
import { loadHouseholdAdminSubmissions, openHouseholdKK } from './lib/householdMembers'
import type { HouseholdAccount, HouseholdSubmission } from './householdTypes'
import './HouseholdMembers.css'

const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Data household member gagal dimuat.'

export default function HouseholdMembersAdmin({ accounts }: { accounts: HouseholdAccount[] }) {
  const [submissions, setSubmissions] = useState<HouseholdSubmission[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Admin-only loading synchronizes the private directory with Supabase/local storage.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadHouseholdAdminSubmissions().then(setSubmissions).catch((reason) => setError(message(reason))).finally(() => setLoading(false)) }, [])

  const accountByHouse = useMemo(() => new Map(accounts.map((account) => [account.houseId, account])), [accounts])
  const statusByHouse = useMemo(() => new Map(submissions.map((submission) => [submission.houseId, submission])), [submissions])
  const filtered = submissions.filter((submission) => {
    const account = accountByHouse.get(submission.houseId)
    return `${account?.code ?? submission.houseId} ${submission.residentName}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  const totalMembers = submissions.reduce((sum, submission) => sum + submission.memberCount, 0)
  const totalLiving = submissions.reduce((sum, submission) => sum + submission.livesInHouseCount, 0)

  return <div className="page-stack household-admin-page">
    <div className="admin-heading"><div><span>Database keluarga warga</span><h2>Household Member</h2><p>Data anggota keluarga dan penghuni bersama tersimpan terpisah dari data kas. Dokumen KK bersifat opsional.</p></div><input className="search-input" placeholder="Cari rumah atau nama…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <section className="household-admin-summary">
      <article><Home size={20} /><span>Rumah sudah mengisi</span><strong>{submissions.length}</strong></article>
      <article><Users size={20} /><span>Total anggota tercatat</span><strong>{totalMembers}</strong></article>
      <article><Users size={20} /><span>Tinggal bersama di rumah</span><strong>{totalLiving}</strong></article>
    </section>
    <section className="panel household-admin-status"><div className="panel-title"><div><span>Status kelengkapan</span><h3>Pengisian per Rumah</h3><p>Kotak hijau sudah tersimpan; kotak merah belum diisi.</p></div></div><div className="household-house-grid">{accounts.map((account) => { const filled = statusByHouse.has(account.houseId); return <div className={filled ? 'filled' : 'empty'} key={account.houseId}><strong>{account.shortCode}</strong><span>{filled ? 'Sudah diisi' : 'Belum'}</span></div> })}</div></section>
    <section className="panel household-admin-records">
      <div className="panel-title"><div><span>{filtered.length} rumah</span><h3>Data Tersimpan</h3><p>Buka setiap rumah untuk melihat rincian anggota. Jika tersedia, dokumen KK memakai tautan privat yang berlaku singkat.</p></div></div>
      {error && <p className="household-message error">{error}</p>}
      <div className="household-admin-list">{filtered.map((submission) => { const account = accountByHouse.get(submission.houseId); return <details key={submission.id}><summary><span><strong>{account?.code ?? `CSJ ${submission.houseId}`}</strong><small>{submission.residentName}</small></span><span>{submission.memberCount} anggota · {submission.livesInHouseCount} tinggal bersama</span><strong>{submission.updatedAt.slice(0, 10)}</strong></summary><div className="household-admin-detail"><div className="household-admin-file"><div><FileText size={19} /><span><strong>Kartu Keluarga</strong><small>{submission.kkName || 'Tidak diunggah (opsional)'}</small></span></div><button disabled={!submission.kkPath} onClick={() => void openHouseholdKK(submission.kkPath ?? '').catch((reason) => setError(message(reason)))} type="button">{submission.kkPath ? 'Buka KK' : 'Tidak tersedia'}</button></div><div className="table-wrap"><table className="household-member-table admin"><thead><tr><th>No.</th><th>Nama</th><th>Jenis Kelamin</th><th>Hubungan</th><th>Tanggal Lahir</th><th>Anggota KK</th><th>Tinggal di Rumah</th></tr></thead><tbody>{submission.members.map((member, index) => <tr key={member.id}><td>{index + 1}</td><td><strong>{member.name}</strong></td><td>{member.gender === 'male' ? 'Laki-laki' : 'Perempuan'}</td><td>{member.relationship}</td><td>{member.birthDate}</td><td>{member.inFamilyCard ? 'Ya' : 'Tidak'}</td><td>{member.livesInHouse ? 'Ya' : 'Tidak'}</td></tr>)}</tbody></table></div></div></details> })}{!filtered.length && <div className="empty-state">{loading ? 'Memuat data household member…' : 'Belum ada data yang sesuai.'}</div>}</div>
    </section>
  </div>
}
