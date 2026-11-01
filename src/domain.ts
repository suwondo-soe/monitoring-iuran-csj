import type {
  AccountStatement,
  BillingAccount,
  House,
  LedgerData,
  Payment,
  Tariff,
} from './types'

export const START_MONTH = '2026-01'
export const DEFAULT_OCCUPIED_FEE = 185_000
export const DEFAULT_EMPTY_FEE = 145_000
export const DEFAULT_JOINT_FEE = 315_000

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00`),
  )

const addMonth = (month: string, delta: number) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export const monthsBetween = (start: string, end: string) => {
  if (end < start) return []
  const months: string[] = []
  let current = start
  while (current <= end) {
    months.push(current)
    current = addMonth(current, 1)
  }
  return months
}

export const previousMonth = (month: string) => addMonth(month, -1)

export function tariffForMonth(tariffs: Tariff[], month: string) {
  const date = `${month}-01`
  return [...tariffs]
    .filter((tariff) => tariff.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? {
    id: 'default',
    effectiveDate: `${START_MONTH}-01`,
    occupiedFee: DEFAULT_OCCUPIED_FEE,
    emptyFee: DEFAULT_EMPTY_FEE,
    notes: 'Tarif awal',
  }
}

const personForHouse = (house: House) =>
  house.residenceStatus === 'rented' && house.tenant ? house.tenant : house.owner

export function buildBillingAccounts(houses: House[]): BillingAccount[] {
  const sorted = [...houses].sort((a, b) => a.id - b.id)
  const jointHouses = sorted.filter((house) => house.id === 2 || house.id === 3)

  return sorted.flatMap((house) => {
    if (house.id === 3) return []
    if (house.id === 2 && jointHouses.length === 2) {
      return [{
        id: 'account-02-03',
        houseIds: [2, 3],
        code: 'CSJ 02 + 03',
        shortCode: '02 + 03',
        residentName: jointHouses[0].owner || jointHouses[1].owner,
        residenceStatus: 'owner_occupied' as const,
        openingArrears: jointHouses.reduce((sum, item) => sum + item.openingArrears, 0),
      }]
    }

    return [{
      id: `account-${String(house.id).padStart(2, '0')}`,
      houseIds: [house.id],
      code: `CSJ ${String(house.id).padStart(2, '0')}`,
      shortCode: String(house.id).padStart(2, '0'),
      residentName: personForHouse(house),
      residenceStatus: house.residenceStatus,
      openingArrears: house.openingArrears,
    }]
  })
}

export function monthlyFeeForAccount(
  account: BillingAccount,
  houses: House[],
  tariffs: Tariff[],
  jointFee: number,
  month: string,
) {
  if (account.houseIds.length === 2) return jointFee
  const house = houses.find((item) => item.id === account.houseIds[0])
  if (!house) return 0
  if (month < house.billingStartMonth) return 0
  if (house.monthlyFeeOverride != null) return house.monthlyFeeOverride
  const tariff = tariffForMonth(tariffs, month)
  return house.residenceStatus === 'empty' ? tariff.emptyFee : tariff.occupiedFee
}

const paymentTotal = (payment: Payment) =>
  payment.mandatoryAmount + payment.arrearsAmount + payment.extraAmount

export function statementForAccount(
  account: BillingAccount,
  data: LedgerData,
  activeMonth: string,
): AccountStatement {
  const accountPayments = data.payments.filter((payment) =>
    account.houseIds.includes(payment.houseId),
  )
  const paidThisPeriod = accountPayments
    .filter((payment) => payment.month === activeMonth)
    .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
  const monthlyDue = monthlyFeeForAccount(
    account,
    data.houses,
    data.tariffs,
    data.jointFee0203,
    activeMonth,
  )
  const priorMonths = monthsBetween(START_MONTH, previousMonth(activeMonth))
  const priorCharges = priorMonths.reduce(
    (sum, month) =>
      sum + monthlyFeeForAccount(account, data.houses, data.tariffs, data.jointFee0203, month),
    account.openingArrears,
  )
  const priorMandatoryPaid = accountPayments
    .filter((payment) => payment.month < activeMonth)
    .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
  const arrearsPaid = accountPayments
    .filter((payment) => payment.month <= activeMonth)
    .reduce((sum, payment) => sum + payment.arrearsAmount, 0)
  const currentBalance = Math.max(monthlyDue - paidThisPeriod, 0)
  const arrearsBalance = Math.max(priorCharges - priorMandatoryPaid - arrearsPaid, 0)
  const totalOutstanding = currentBalance + arrearsBalance

  return {
    ...account,
    monthlyDue,
    paidThisPeriod,
    currentBalance,
    arrearsBalance,
    totalOutstanding,
    isPaid: totalOutstanding === 0,
  }
}

export function cashSummary(data: LedgerData, activeMonth: string, asOfDate: string) {
  const monthIncome = data.payments
    .filter((payment) => payment.paymentDate.startsWith(activeMonth) && payment.paymentDate <= asOfDate)
    .reduce((sum, payment) => sum + paymentTotal(payment), 0)
  const monthExpenses = data.expenses
    .filter((expense) => expense.date.startsWith(activeMonth) && expense.date <= asOfDate)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const allIncome = data.payments
    .filter((payment) => payment.paymentDate <= asOfDate)
    .reduce((sum, payment) => sum + paymentTotal(payment), 0)
  const allExpenses = data.expenses
    .filter((expense) => expense.date <= asOfDate)
    .reduce((sum, expense) => sum + expense.amount, 0)

  return {
    monthIncome,
    monthExpenses,
    cashBalance: data.openingCashBalance + allIncome - allExpenses,
  }
}
