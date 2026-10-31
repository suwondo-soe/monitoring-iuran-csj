export type PublicView = 'overview' | 'dues' | 'expenses'
export type AdminView = 'payments' | 'expenses' | 'houses' | 'settings'
export type ResidenceStatus = 'owner_occupied' | 'rented' | 'empty'

export type House = {
  id: number
  number: string
  owner: string
  residenceStatus: ResidenceStatus
  tenant: string
  rentalStartDate: string
  openingArrears: number
  monthlyFeeOverride?: number | null
}

export type Tariff = {
  id: string
  effectiveDate: string
  occupiedFee: number
  emptyFee: number
  notes: string
}

export type Payment = {
  id: string
  houseId: number
  month: string
  paymentDate: string
  mandatoryAmount: number
  arrearsAmount: number
  extraAmount: number
  extraType: string
  method: string
  notes: string
}

export type Expense = {
  id: string
  date: string
  category: string
  amount: number
  description: string
}

export type LedgerData = {
  houses: House[]
  tariffs: Tariff[]
  payments: Payment[]
  expenses: Expense[]
  openingCashBalance: number
  jointFee0203: number
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
}

export type BillingAccount = {
  id: string
  houseIds: number[]
  code: string
  shortCode: string
  residentName: string
  residenceStatus: ResidenceStatus
  openingArrears: number
}

export type AccountStatement = BillingAccount & {
  monthlyDue: number
  paidThisPeriod: number
  currentBalance: number
  arrearsBalance: number
  totalOutstanding: number
  isPaid: boolean
}
