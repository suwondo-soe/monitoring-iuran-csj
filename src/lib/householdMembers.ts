import { supabase } from './supabase'
import type {
  HouseholdMember,
  HouseholdStatistic,
  HouseholdSubmission,
  HouseholdSubmissionStatus,
} from '../householdTypes'

const localKey = 'csj-household-member-submissions'

type StoredSubmission = HouseholdSubmission & { editCode: string }

const localRows = (): StoredSubmission[] =>
  JSON.parse(localStorage.getItem(localKey) || '[]') as StoredSubmission[]

const memberFromRow = (row: Record<string, unknown>): HouseholdMember => ({
  id: String(row.id ?? crypto.randomUUID()),
  name: String(row.name ?? ''),
  gender: row.gender === 'male' || row.gender === 'female' ? row.gender : '',
  relationship: String(row.relationship ?? '') as HouseholdMember['relationship'],
  birthDate: String(row.birth_date ?? row.birthDate ?? ''),
  inFamilyCard: typeof (row.in_family_card ?? row.inFamilyCard) === 'boolean'
    ? Boolean(row.in_family_card ?? row.inFamilyCard) : null,
  livesInHouse: typeof (row.lives_in_house ?? row.livesInHouse) === 'boolean'
    ? Boolean(row.lives_in_house ?? row.livesInHouse) : null,
})

export async function loadHouseholdStatuses(): Promise<HouseholdSubmissionStatus[]> {
  if (!supabase) return localRows().map(({ editCode: _editCode, kkPath: _kkPath, members: _members, id: _id, kkName: _kkName, ...status }) => status)
  const { data, error } = await supabase.rpc('get_household_submission_status')
  if (error) throw new Error(error.message)
  return (data as Array<Record<string, unknown>>).map((row) => ({
    houseId: Number(row.house_id), residentName: String(row.resident_name),
    memberCount: Number(row.member_count), livesInHouseCount: Number(row.lives_in_house_count),
    updatedAt: String(row.updated_at),
  }))
}

export async function loadHouseholdStatistics(): Promise<HouseholdStatistic[]> {
  if (!supabase) {
    const members = localRows().flatMap((row) => row.members)
    const age = (birthDate: string) => Math.max(0, Math.floor((Date.now() - Date.parse(birthDate)) / 31557600000))
    const ageLabel = (value: number) => value <= 5 ? '0–5 tahun' : value <= 12 ? '6–12 tahun'
      : value <= 17 ? '13–17 tahun' : value <= 25 ? '18–25 tahun'
        : value <= 40 ? '26–40 tahun' : value <= 59 ? '41–59 tahun' : '60+ tahun'
    const rows: HouseholdStatistic[] = [
      { category: 'summary', label: 'Total anggota tercatat', total: members.length },
      { category: 'summary', label: 'Tinggal bersama di rumah', total: members.filter((item) => item.livesInHouse).length },
      { category: 'summary', label: 'Rumah sudah mengisi', total: localRows().length },
    ]
    const addGroups = (category: string, values: string[]) => {
      const counts = new Map<string, number>()
      values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
      counts.forEach((total, label) => rows.push({ category, label, total }))
    }
    addGroups('gender', members.map((item) => item.gender === 'male' ? 'Laki-laki' : 'Perempuan'))
    addGroups('age', members.filter((item) => item.birthDate).map((item) => ageLabel(age(item.birthDate))))
    addGroups('relationship', members.map((item) => item.relationship || 'Lainnya'))
    addGroups('family_card', members.map((item) => item.inFamilyCard ? 'Anggota KK' : 'Bukan anggota KK'))
    addGroups('residence', members.map((item) => item.livesInHouse ? 'Tinggal di rumah' : 'Tidak tinggal di rumah'))
    return rows
  }
  const { data, error } = await supabase.rpc('get_household_statistics')
  if (error) throw new Error(error.message)
  return (data as Array<Record<string, unknown>>).map((row) => ({
    category: String(row.category), label: String(row.label), total: Number(row.total),
  }))
}

export async function loadHouseholdSubmission(houseId: number, residentName: string, editCode: string): Promise<HouseholdSubmission> {
  if (!supabase) {
    const row = localRows().find((item) => item.houseId === houseId && item.residentName.toLowerCase() === residentName.toLowerCase())
    if (!row || row.editCode !== editCode) throw new Error('Kode pembaruan tidak sesuai.')
    return row
  }
  const { data, error } = await supabase.rpc('load_household_submission', {
    p_house_id: houseId, p_resident_name: residentName, p_edit_code: editCode,
  })
  if (error) throw new Error(error.message)
  const row = data as Record<string, unknown>
  return {
    id: String(row.id), houseId: Number(row.house_id), residentName: String(row.resident_name),
    memberCount: Number(row.member_count), livesInHouseCount: Number(row.lives_in_house_count),
    updatedAt: String(row.updated_at), kkName: String(row.kk_name ?? ''),
    members: Array.isArray(row.members) ? row.members.map((item) => memberFromRow(item as Record<string, unknown>)) : [],
  }
}

export async function uploadHouseholdKK(houseId: number, file: File) {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('KK harus berupa PDF, JPG, atau PNG.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran KK maksimal 5 MB.')
  if (!supabase) return `local/${houseId}/${file.name}`
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${houseId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('household-family-cards').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

export async function saveHouseholdSubmission(input: {
  houseId: number
  residentName: string
  editCode: string
  members: HouseholdMember[]
  kkPath?: string
  kkName?: string
}) {
  if (!supabase) {
    const rows = localRows()
    const existing = rows.find((item) => item.houseId === input.houseId && item.residentName.toLowerCase() === input.residentName.toLowerCase())
    if (existing && existing.editCode !== input.editCode) throw new Error('Kode pembaruan tidak sesuai.')
    const next: StoredSubmission = {
      id: existing?.id ?? crypto.randomUUID(), houseId: input.houseId, residentName: input.residentName,
      editCode: input.editCode, kkPath: input.kkPath || existing?.kkPath || '',
      kkName: input.kkName || existing?.kkName || '', members: input.members,
      memberCount: input.members.length,
      livesInHouseCount: input.members.filter((item) => item.livesInHouse).length,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(localKey, JSON.stringify([...rows.filter((item) => item.id !== next.id), next]))
    return next.id
  }
  const { data, error } = await supabase.rpc('save_household_submission', {
    p_house_id: input.houseId,
    p_resident_name: input.residentName,
    p_edit_code: input.editCode,
    p_members: input.members.map((member, index) => ({
      id: member.id, sort_order: index + 1, name: member.name, gender: member.gender,
      relationship: member.relationship, birth_date: member.birthDate,
      in_family_card: member.inFamilyCard, lives_in_house: member.livesInHouse,
    })),
    p_kk_path: input.kkPath || null,
    p_kk_name: input.kkName || null,
  })
  if (error) throw new Error(error.message)
  return String(data)
}

export async function loadHouseholdAdminSubmissions(): Promise<HouseholdSubmission[]> {
  if (!supabase) return localRows()
  const { data, error } = await supabase.from('household_submissions')
    .select('id,house_id,resident_name,kk_path,kk_name,updated_at,household_members(id,name,gender,relationship,birth_date,in_family_card,lives_in_house,sort_order)')
    .order('house_id')
  if (error) throw new Error(error.message)
  return (data as Array<Record<string, unknown>>).map((row) => {
    const members = Array.isArray(row.household_members)
      ? [...row.household_members as Array<Record<string, unknown>>]
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map(memberFromRow)
      : []
    return {
      id: String(row.id), houseId: Number(row.house_id), residentName: String(row.resident_name),
      kkPath: String(row.kk_path ?? ''), kkName: String(row.kk_name ?? ''),
      updatedAt: String(row.updated_at), members, memberCount: members.length,
      livesInHouseCount: members.filter((item) => item.livesInHouse).length,
    }
  })
}

export async function openHouseholdKK(path: string) {
  if (!supabase || !path) return
  const { data, error } = await supabase.storage.from('household-family-cards').createSignedUrl(path, 60)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}
