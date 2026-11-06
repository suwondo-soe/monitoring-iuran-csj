import type { HouseParty, PartyKind } from './lib/houseDirectory'
import type { LedgerData } from './types'

export type PartySaveOptions = { moveIn: boolean, stayStart: string }
export const previousDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
export const nextDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)

export function directoryTransition(ledger: LedgerData, owners: HouseParty[], tenants: HouseParty[], kind: PartyKind, party: HouseParty, options: PartySaveOptions, today: string) {
  const house = ledger.houses.find(h => h.id === party.house_id)
  if (!house) throw new Error('Nomor rumah tidak ditemukan.')
  const rows = kind === 'owners' ? owners : tenants
  const old = rows.find(row => row.id === party.id)
  if (old && (old.house_id !== party.house_id || old.name !== party.name || old.start_date !== party.start_date || old.end_date !== party.end_date)) throw new Error('Gunakan alur pergantian untuk perubahan pihak/periode.')
  const current = rows.find(row => row.house_id === house.id && !row.end_date)
  if (!old && (!party.name.trim() || !party.start_date || party.start_date > today || party.end_date)) throw new Error('Nama dan tanggal mulai wajib diisi dan tidak boleh di masa depan.')
  if (!old && current && ((current.start_date && party.start_date <= current.start_date) || current.name.trim().toLowerCase() === party.name.trim().toLowerCase())) throw new Error('Gunakan Edit untuk pihak yang sama; tanggal pergantian harus setelah tanggal mulai sebelumnya.')
  if (old && kind === 'owners' && options.moveIn && (old.end_date || old.name !== house.owner)) throw new Error('Hanya pemilik saat ini yang dapat mulai tinggal.')
  const transition = kind === 'tenants' ? !old : options.moveIn || (!old && house.residenceStatus === 'owner_occupied')
  const day = options.moveIn || kind === 'tenants' ? options.stayStart : party.start_date
  if (transition && (!day || day > today || (party.start_date && day < party.start_date))) throw new Error('Tanggal mulai tinggal tidak valid.')
  const active = ledger.houseOccupancies.find(o => o.houseId === house.id && !o.endDate)
  const name = kind === 'tenants' || options.moveIn ? party.name : ''
  const role = kind === 'tenants' ? 'tenant' as const : 'owner' as const
  const occupantChanges = transition && (!active || active.occupantName !== name || active.occupantRole !== role)
  if (occupantChanges && active && day <= active.startDate) throw new Error('Tanggal perubahan harus setelah tanggal mulai penghuni aktif.')
  if (transition && tenants.some(row => row.house_id === house.id && !row.end_date && row.id !== party.id && row.start_date >= day)) throw new Error('Tanggal perubahan harus setelah tanggal mulai sewa aktif.')
  const saved = { ...party, owner_name: old?.owner_name ?? house.owner }
  const nextRows = [...rows.filter(row => row.id !== party.id).map(row => !old && row.house_id === house.id && !row.end_date ? { ...row, end_date: previousDay(party.start_date) } : row), saved]
  let nextTenants = kind === 'tenants' ? nextRows : tenants
  if (kind === 'owners' && !old) nextTenants = nextTenants.map(row => row.house_id === house.id && !row.end_date ? { ...row, owner_name: party.name } : row)
  if (transition) nextTenants = nextTenants.map(row => row.house_id === house.id && !row.end_date && row.id !== party.id ? { ...row, end_date: previousDay(day) } : row)
  return {
    owners: kind === 'owners' ? nextRows : owners, tenants: nextTenants,
    ledger: { ...ledger,
      houses: ledger.houses.map(h => h.id !== house.id ? h : { ...h,
        owner: kind === 'owners' && !old ? party.name : h.owner,
        ...(transition ? { residenceStatus: kind === 'tenants' ? 'rented' as const : options.moveIn ? 'owner_occupied' as const : 'empty' as const,
          tenant: kind === 'tenants' ? party.name : '', rentalStartDate: kind === 'tenants' ? day : '', vacancyStartDate: name ? '' : day } : {}),
      }),
      houseOccupancies: !occupantChanges ? ledger.houseOccupancies : [
        ...(name ? [{ id: crypto.randomUUID(), houseId: house.id, occupantName: name, occupantRole: role, startDate: day, endDate: '', notes: 'Dari database pemilik/penyewa' }] : []),
        ...ledger.houseOccupancies.map(o => o.houseId === house.id && !o.endDate ? { ...o, endDate: previousDay(day) } : o),
      ],
    },
  }
}
