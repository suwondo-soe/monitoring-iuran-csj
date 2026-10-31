export type Tab = 'summary' | 'collection' | 'expenses'
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
  payments: Payment[]
  expenses: Expense[]
  openingCashBalance: number
}
