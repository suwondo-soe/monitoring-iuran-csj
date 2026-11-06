import { supabase } from './supabase'
import { directoryTransition, nextDay } from '../directoryTransitions'
import type { PartySaveOptions } from '../directoryTransitions'
import type { LedgerData } from '../types'

export type PartyKind = 'owners' | 'tenants'
export type HouseParty = {
  id: string
  house_id: number
  name: string
  owner_name: string
  start_date: string
  end_date: string
  phone: string
  kk_path: string
  kk_name: string
}
const table = (kind: PartyKind) => kind === 'owners' ? 'house_owners' : 'house_tenants'
const localKey = (kind: PartyKind) => `csj-private-${kind}-v1`
export async function loadParties(kind: PartyKind): Promise<HouseParty[]> {
  if (!supabase) {
    const stored = localStorage.getItem(localKey(kind))
    if (stored !== null) return JSON.parse(stored)
    const ledger = JSON.parse(localStorage.getItem('csj-ledger-v2') || 'null') as LedgerData | null
    if (!ledger) return []
    const rows: HouseParty[] = kind === 'owners'
      ? ledger.houses.filter(h => h.owner.trim()).map(h => ({ id: crypto.randomUUID(), house_id: h.id, name: h.owner, owner_name: '', start_date: '', end_date: '', phone: '', kk_path: '', kk_name: '' }))
      : ledger.houses.filter(h => h.residenceStatus === 'rented' && h.tenant.trim()).map(h => ({ id: crypto.randomUUID(), house_id: h.id, name: h.tenant, owner_name: h.owner, start_date: h.rentalStartDate, end_date: '', phone: '', kk_path: '', kk_name: '' }))
    localStorage.setItem(localKey(kind), JSON.stringify(rows))
    return rows
  }
  const { data, error } = await supabase.from(table(kind)).select('*').order('house_id').order('start_date')
  if (error) throw new Error(`Database ${kind === 'owners' ? 'pemilik' : 'penyewa'} belum dapat dimuat. ${error.message}`)
  return data.map(row => ({ ...row, start_date: row.start_date ?? '', end_date: row.end_date ?? '' }))
}
export async function saveParty(kind: PartyKind, party: HouseParty, options: PartySaveOptions) {
  if (!supabase) {
    const ledger = JSON.parse(localStorage.getItem('csj-ledger-v2') || 'null') as LedgerData | null
    if (!ledger) throw new Error('Data rumah belum tersedia.')
    const today = new Date().toLocaleDateString('sv-SE')
    const result = directoryTransition(ledger, await loadParties('owners'), await loadParties('tenants'), kind, party, options, today)
    localStorage.setItem(localKey('owners'), JSON.stringify(result.owners))
    localStorage.setItem(localKey('tenants'), JSON.stringify(result.tenants))
    localStorage.setItem('csj-ledger-v2', JSON.stringify(result.ledger))
    return
  }
  const { error } = await supabase.rpc('save_house_party', { p_kind: kind, p_record: party, p_move_in: options.moveIn, p_stay_start: options.stayStart || null })
  if (error) throw new Error(error.message)
}
export async function endResidence(houseId: number, lastDay: string) {
  if (supabase) {
    const { error } = await supabase.rpc('end_house_residence', { p_house_id: houseId, p_last_day: lastDay })
    if (error) throw new Error(error.message)
    return
  }
  const ledger = JSON.parse(localStorage.getItem('csj-ledger-v2') || 'null') as LedgerData | null
  const house = ledger?.houses.find(h => h.id === houseId)
  if (!ledger || !house || house.residenceStatus === 'empty' || !lastDay || lastDay >= new Date().toLocaleDateString('sv-SE')) throw new Error('Pilih tanggal terakhir tinggal sebelum hari ini.')
  if (ledger.houseOccupancies.some(o => o.houseId === houseId && !o.endDate && o.startDate > lastDay)) throw new Error('Tanggal selesai mendahului tanggal mulai tinggal.')
  const tenants = await loadParties('tenants')
  if (tenants.some(row => row.house_id === houseId && !row.end_date && row.start_date > lastDay)) throw new Error('Tanggal selesai mendahului tanggal mulai sewa.')
  localStorage.setItem(localKey('tenants'), JSON.stringify(tenants.map(row => row.house_id === houseId && !row.end_date ? { ...row, end_date: lastDay } : row)))
  localStorage.setItem('csj-ledger-v2', JSON.stringify({ ...ledger,
    houses: ledger.houses.map(h => h.id === houseId ? { ...h, residenceStatus: 'empty', tenant: '', rentalStartDate: '', vacancyStartDate: nextDay(lastDay) } : h),
    houseOccupancies: ledger.houseOccupancies.map(o => o.houseId === houseId && !o.endDate ? { ...o, endDate: lastDay } : o),
  }))
}
export async function uploadKK(kind: PartyKind, id: string, file: File) {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('KK harus berupa PDF, JPG, atau PNG.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran KK maksimal 5 MB.')
  if (!supabase) throw new Error('Unggahan KK memerlukan koneksi Supabase; mode lokal hanya menyimpan data teks.')
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${kind}/${id}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('family-cards').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}
export async function removeKK(path: string) {
  if (!supabase || !path) return
  const { error } = await supabase.storage.from('family-cards').remove([path])
  if (error) throw new Error(error.message)
}
export async function openKK(path: string) {
  if (!supabase) return
  const { data, error } = await supabase.storage.from('family-cards').createSignedUrl(path, 60)
  if (error) throw new Error(error.message)
  // A short-lived URL is requested only when an administrator opens a document.
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}
