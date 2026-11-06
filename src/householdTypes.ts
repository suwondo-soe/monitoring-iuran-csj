export type HouseholdGender = 'male' | 'female'

export type HouseholdRelationship =
  | 'Kepala Keluarga'
  | 'Istri'
  | 'Anak'
  | 'Cucu'
  | 'Orang Tua'
  | 'Mertua'
  | 'Lainnya'

export type HouseholdAccount = {
  houseId: number
  houseIds: number[]
  code: string
  shortCode: string
  residentName: string
}

export type HouseholdMember = {
  id: string
  name: string
  gender: HouseholdGender | ''
  relationship: HouseholdRelationship | ''
  birthDate: string
  inFamilyCard: boolean | null
  livesInHouse: boolean | null
}

export type HouseholdSubmissionStatus = {
  houseId: number
  residentName: string
  memberCount: number
  livesInHouseCount: number
  updatedAt: string
}

export type HouseholdSubmission = HouseholdSubmissionStatus & {
  id: string
  kkName: string
  kkPath?: string
  members: HouseholdMember[]
}

export type HouseholdStatistic = {
  category: string
  label: string
  total: number
}

