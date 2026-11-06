import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { House } from './types'
import { endResidence, loadParties, openKK, removeKK, saveParty, uploadKK } from './lib/houseDirectory'
import type { HouseParty, PartyKind } from './lib/houseDirectory'
import { previousDay } from './directoryTransitions'

const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Data gagal disimpan.'
export default function HouseDirectory({ houses, query, outstanding, onSaved }: {
  houses: House[], query: string, outstanding: (houseId: number, name: string) => number,
  onSaved: () => Promise<void>,
}) {
  const today = new Date().toLocaleDateString('sv-SE')
  const [kind, setKind] = useState<PartyKind>('owners')
  const [rows, setRows] = useState<HouseParty[]>([])
  const [form, setForm] = useState<HouseParty | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [moveIn, setMoveIn] = useState(false)
  const [stayStart, setStayStart] = useState(today)
  const [ending, setEnding] = useState(false)
  const [endHouse, setEndHouse] = useState('')
  const [lastDay, setLastDay] = useState(previousDay(today))
  const isEditing = !!form && rows.some(row => row.id === form.id)
  const selectedHouse = houses.find(h => h.id === form?.house_id)
  useEffect(() => {
    let cancelled = false
    setRows([]); setForm(null); setEnding(false); setError(''); setNotice(''); setBusy(true)
    loadParties(kind).then(data => { if (!cancelled) setRows(data) })
      .catch(reason => { if (!cancelled) setError(message(reason)) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [kind])
  const edit = (row: HouseParty) => { setForm(row); setFile(null); setRemoveFile(false); setMoveIn(false); setStayStart(today); setEnding(false); setError(''); setNotice('') }
  const add = () => {
    edit({ id: crypto.randomUUID(), house_id: houses[0]?.id ?? 1, name: '', owner_name: houses[0]?.owner ?? '', start_date: today, end_date: '', phone: '', kk_path: '', kk_name: '' })
    setMoveIn(kind === 'tenants' || houses[0]?.residenceStatus === 'owner_occupied')
  }
  const endStay = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await endResidence(Number(endHouse), lastDay)
      setEnding(false); setNotice('Masa tinggal berakhir. Rumah menjadi kosong dan riwayat tersimpan.')
      await onSaved(); setRows(await loadParties(kind))
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || busy) return
    if (!isEditing && (!form.start_date || form.start_date > today)) { setError('Tanggal mulai tidak boleh di masa depan.'); return }
    if ((!isEditing && kind === 'tenants' || moveIn) && (!stayStart || stayStart > today || form.start_date && stayStart < form.start_date)) { setError('Tanggal mulai tinggal harus sejak tanggal kepemilikan/sewa sampai hari ini.'); return }
    setBusy(true); setError(''); setNotice('')
    let uploaded = ''
    let saved = false
    try {
      if (file) uploaded = await uploadKK(kind, form.id, file)
      const next = { ...form, name: form.name.trim(), phone: form.phone.trim(), kk_path: uploaded || (removeFile ? '' : form.kk_path), kk_name: file?.name || (removeFile ? '' : form.kk_name) }
      await saveParty(kind, next, { moveIn: kind === 'tenants' ? !isEditing : moveIn, stayStart })
      saved = true
      setForm(null); setFile(null); setNotice('Data berhasil disimpan. Data penghuni dan riwayat diperbarui otomatis.')
      if ((uploaded || removeFile) && form.kk_path) {
        try { await removeKK(form.kk_path) } catch { setNotice('Data disimpan, tetapi berkas KK lama belum berhasil dibersihkan.') }
      }
      await onSaved(); setRows(await loadParties(kind))
    } catch (reason) {
      if (uploaded && !saved) { try { await removeKK(uploaded) } catch { /* Preserve the original save error. */ } }
      setError(message(reason))
    } finally { setBusy(false) }
  }
  const filtered = rows.filter(row => `${houses.find(h => h.id === row.house_id)?.number} ${row.name} ${row.owner_name} ${row.phone}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="panel house-directory">
    <div className="panel-title"><div><span>36 rumah · khusus admin</span><h3>Pemilik dan Penyewa Rumah</h3><p>Cukup catat pergantian pemilik atau penyewa di sini. Data penghuni mengikuti otomatis; telepon dan KK hanya untuk admin.</p></div></div>
    <div className="directory-toolbar"><div className="recap-year-tabs" aria-label="Database rumah">{(['owners', 'tenants'] as const).map(value => <button type="button" key={value} disabled={busy} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>{value === 'owners' ? 'Pemilik Rumah' : 'Penyewa Rumah'}</button>)}</div><div className="directory-actions"><button type="button" className="primary-action" disabled={busy} onClick={add}>{kind === 'owners' ? 'Ganti Pemilik' : 'Tambah Penyewa'}</button><button type="button" disabled={busy || !houses.some(h => h.residenceStatus !== 'empty')} onClick={() => { setForm(null); setEnding(true); setError(''); setEndHouse(String(houses.find(h => h.residenceStatus !== 'empty')?.id ?? '')) }}>Akhiri masa tinggal</button></div></div>
    {error && <p role="alert" className="directory-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {form && <form className="form-grid directory-form" onSubmit={save}>
      <h4 className="wide">{isEditing ? 'Edit kontak dan KK' : kind === 'owners' ? 'Ganti Pemilik' : 'Tambah Penyewa'}</h4>
      <label>Nomor rumah<select disabled={busy || isEditing} value={form.house_id} onChange={e => { const h = houses.find(h => h.id === Number(e.target.value)); setForm({ ...form, house_id: Number(e.target.value), owner_name: h?.owner ?? '' }); setMoveIn(kind === 'tenants' || h?.residenceStatus === 'owner_occupied') }}>{houses.map(h => <option key={h.id} value={h.id}>{h.number}</option>)}</select></label>
      <label>Nama {kind === 'owners' ? 'pemilik' : 'penyewa'}<input required readOnly={isEditing} disabled={busy} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      {kind === 'tenants' ? <label>Nama pemilik rumah<input readOnly value={isEditing ? form.owner_name : selectedHouse?.owner ?? ''} /></label> : !isEditing && <label>Pemilik sebelumnya<input readOnly value={selectedHouse?.owner ?? ''} /></label>}
      <label>Mulai {kind === 'owners' ? 'kepemilikan' : 'sewa'}<input type="date" required={!isEditing} readOnly={isEditing} max={today} disabled={busy} value={form.start_date} onChange={e => { setForm({ ...form, start_date: e.target.value }); setStayStart(e.target.value) }} />{isEditing && !form.start_date && <small>Belum diketahui.</small>}</label>
      {isEditing && <label>Tanggal berakhir<input type="date" readOnly value={form.end_date} /><small>{form.end_date ? 'Riwayat tersimpan.' : 'Masih berlangsung.'}</small></label>}
      {kind === 'owners' && (!isEditing || !form.end_date && form.name === selectedHouse?.owner && selectedHouse.residenceStatus !== 'owner_occupied') && <label className="wide directory-checkbox"><input type="checkbox" disabled={busy} checked={moveIn} onChange={e => setMoveIn(e.target.checked)} />Pemilik mulai tinggal di rumah ini<small>{moveIn ? 'Penghuni sebelumnya akan masuk riwayat.' : selectedHouse?.residenceStatus === 'rented' ? 'Penyewa saat ini tetap tinggal.' : 'Rumah menjadi atau tetap kosong.'}</small></label>}
      {(!isEditing && kind === 'tenants' || moveIn) && <label>Tanggal mulai tinggal<input type="date" required min={form.start_date} max={today} disabled={busy} value={stayStart} onChange={e => setStayStart(e.target.value)} /></label>}
      {!isEditing && <p className="wide">Periode sebelumnya ditutup otomatis. Jumlah rumah tetap {houses.length}; tunggakan pihak lama tetap tercatat.</p>}
      <label>Nomor telepon<input type="tel" disabled={busy} placeholder="08… / +62…" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
      <label>Kartu Keluarga (KK)<input type="file" disabled={busy} accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} /><small>PDF, JPG, PNG · maksimal 5 MB.</small>{form.kk_path && <span>{form.kk_name}<label><input type="checkbox" disabled={busy} checked={removeFile} onChange={e => setRemoveFile(e.target.checked)} />Hapus KK tersimpan</label></span>}</label>
      <div className="directory-actions wide"><button className="primary-action" disabled={busy} type="submit">{busy ? 'Menyimpan…' : 'Simpan'}</button><button type="button" disabled={busy} onClick={() => setForm(null)}>Batal</button></div>
    </form>}
    {ending && <form className="form-grid directory-form" onSubmit={endStay}><h4 className="wide">Akhiri masa tinggal</h4><label>Nomor rumah<select required disabled={busy} value={endHouse} onChange={e => setEndHouse(e.target.value)}>{houses.filter(h => h.residenceStatus !== 'empty').map(h => <option key={h.id} value={h.id}>{h.number} · {h.residenceStatus === 'rented' ? h.tenant : h.owner}</option>)}</select></label><label>Tanggal terakhir tinggal<input type="date" required disabled={busy} max={previousDay(today)} value={lastDay} onChange={e => setLastDay(e.target.value)} /></label><p className="wide">Rumah tercatat kosong mulai hari berikutnya. Kepemilikan tetap tersimpan.</p><div className="directory-actions wide"><button type="submit" disabled={busy} className="primary-action">Simpan akhir masa tinggal</button><button type="button" disabled={busy} onClick={() => setEnding(false)}>Batal</button></div></form>}
    <div className="table-wrap"><table><thead><tr><th>No rumah</th><th>Nama {kind === 'owners' ? 'pemilik' : 'penyewa'}</th>{kind === 'tenants' && <th>Pemilik rumah</th>}<th>Mulai {kind === 'owners' ? 'kepemilikan' : 'sewa'}</th><th>Berakhir</th><th>Telepon</th><th>KK</th><th>Tunggakan</th><th /></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td>{houses.find(h => h.id === row.house_id)?.number}</td><td><strong>{row.name}</strong></td>{kind === 'tenants' && <td>{row.owner_name}</td>}<td>{row.start_date || 'Belum diketahui'}</td><td>{row.end_date || 'Masih berlangsung'}</td><td>{row.phone || '—'}</td><td>{row.kk_path ? <button type="button" onClick={() => void openKK(row.kk_path).catch(reason => setError(message(reason)))}>Buka KK</button> : 'Belum diunggah'}</td><td>{currency.format(outstanding(row.house_id, row.name))}</td><td><button type="button" disabled={busy} onClick={() => edit(row)}>Edit</button></td></tr>)}{!filtered.length && <tr><td colSpan={kind === 'owners' ? 9 : 10}><div className="empty-state">{busy ? 'Memuat database…' : 'Belum ada data yang sesuai.'}</div></td></tr>}</tbody></table></div>
    <small>Tunggakan mengikuti catatan iuran berdasarkan rumah dan nama; akun CSJ 02+03 dihitung bersama. Riwayat pemilik, penyewa, dan penghuni tetap tersimpan.</small>
  </section>
}
