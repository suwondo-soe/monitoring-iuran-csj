import type {
  AccountStatement,
  BillingAccount,
  House,
  LedgerData,
  OccupantRole,
  Payment,
  ReceivableTransaction,
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

export const normalizePersonName = (value: string) => value
  .trim()
  .toLocaleLowerCase('id-ID')
  .replace(/\s*\/\s*/g, '/')
  .replace(/\s+/g, ' ')

export const samePerson = (first: string, second: string) =>
  Boolean(first.trim() && second.trim()) && normalizePersonName(first) === normalizePersonName(second)

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

export type MonthlyResponsibility = {
  name: string
  role: OccupantRole
  occupancyId: string | null
}

/**
 * Iuran satu bulan dibebankan kepada penghuni yang aktif pada tanggal 1 bulan itu.
 * Jika riwayat belum tersedia, data penghuni aktif menjadi fallback agar data lama
 * tetap dapat ditampilkan.
 */
export function responsibilityForAccountMonth(
  account: BillingAccount,
  data: LedgerData,
  month: string,
): MonthlyResponsibility {
  if (account.houseIds.length > 1) {
    return { name: account.residentName, role: 'owner', occupancyId: null }
  }

  const houseId = account.houseIds[0]
  const monthStart = `${month}-01`
  const occupancy = data.houseOccupancies
    .filter((item) => item.houseId === houseId
      && item.startDate <= monthStart
      && (!item.endDate || item.endDate >= monthStart))
    .sort((first, second) => second.startDate.localeCompare(first.startDate))[0]

  if (occupancy) {
    return {
      name: occupancy.occupantName,
      role: occupancy.occupantRole,
      occupancyId: occupancy.id,
    }
  }

  return {
    name: account.residentName,
    role: account.residenceStatus === 'rented' ? 'tenant' : 'owner',
    occupancyId: null,
  }
}

const paymentTotal = (payment: Payment) =>
  payment.mandatoryAmount + payment.arrearsAmount + payment.extraAmount

export const receivableCashMovement = (transaction: ReceivableTransaction) =>
  transaction.transactionType === 'repayment' ? transaction.amount : -transaction.amount

export function statementForAccount(
  account: BillingAccount,
  data: LedgerData,
  activeMonth: string,
): AccountStatement {
  const accountPayments = data.payments.filter((payment) =>
    account.houseIds.includes(payment.houseId),
  )
  const belongsToCurrentResident = (month: string) =>
    samePerson(responsibilityForAccountMonth(account, data, month).name, account.residentName)
  const currentResidentPayments = accountPayments.filter((payment) =>
    belongsToCurrentResident(payment.month),
  )
  const paidThisPeriod = currentResidentPayments
    .filter((payment) => payment.month === activeMonth)
    .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
  const monthlyDue = belongsToCurrentResident(activeMonth)
    ? monthlyFeeForAccount(account, data.houses, data.tariffs, data.jointFee0203, activeMonth)
    : 0
  const currentOpeningItems = data.openingArrearsItems.filter((item) =>
    item.houseId !== null
    && account.houseIds.includes(item.houseId)
    && samePerson(item.debtorName, account.residentName),
  )
  const currentOpeningIds = new Set(currentOpeningItems.map((item) => item.id))
  const currentOpeningOriginal = currentOpeningItems.reduce((sum, item) => sum + item.originalAmount, 0)
  const priorMonths = monthsBetween(START_MONTH, previousMonth(activeMonth))
  const priorCharges = priorMonths.reduce(
    (sum, month) =>
      sum + (belongsToCurrentResident(month)
        ? monthlyFeeForAccount(account, data.houses, data.tariffs, data.jointFee0203, month)
        : 0),
    currentOpeningOriginal,
  )
  const priorMandatoryPaid = currentResidentPayments
    .filter((payment) => payment.month < activeMonth)
    .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
  const genericArrearsPaid = currentResidentPayments
    .filter((payment) => !payment.openingArrearsItemId && payment.paymentDate.slice(0, 7) <= activeMonth)
    .reduce((sum, payment) => sum + payment.arrearsAmount, 0)
  const linkedOpeningArrearsPaid = accountPayments
    .filter((payment) => payment.openingArrearsItemId != null
      && currentOpeningIds.has(payment.openingArrearsItemId)
      && payment.paymentDate.slice(0, 7) <= activeMonth)
    .reduce((sum, payment) => sum + payment.arrearsAmount, 0)
  const dedicatedOpeningArrearsPaid = data.openingArrearsPayments
    .filter((payment) => payment.paymentDate.slice(0, 7) <= activeMonth)
    .filter((payment) => currentOpeningIds.has(payment.openingArrearsItemId))
    .reduce((sum, payment) => sum + payment.amount, 0)
  const openingArrears = Math.max(
    currentOpeningOriginal - linkedOpeningArrearsPaid - dedicatedOpeningArrearsPaid,
    0,
  )
  const currentBalance = Math.max(monthlyDue - paidThisPeriod, 0)
  const arrearsBalance = Math.max(
    priorCharges - priorMandatoryPaid - genericArrearsPaid
      - linkedOpeningArrearsPaid - dedicatedOpeningArrearsPaid,
    0,
  )
  const totalOutstanding = currentBalance + arrearsBalance

  return {
    ...account,
    openingArrears,
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
    + data.openingArrearsPayments
      .filter((payment) => payment.paymentDate.startsWith(activeMonth) && payment.paymentDate <= asOfDate)
      .reduce((sum, payment) => sum + payment.amount, 0)
  const monthExpenses = data.expenses
    .filter((expense) => expense.date.startsWith(activeMonth) && expense.date <= asOfDate)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const allIncome = data.payments
    .filter((payment) => payment.paymentDate <= asOfDate)
    .reduce((sum, payment) => sum + paymentTotal(payment), 0)
    + data.openingArrearsPayments
      .filter((payment) => payment.paymentDate <= asOfDate)
      .reduce((sum, payment) => sum + payment.amount, 0)
  const allExpenses = data.expenses
    .filter((expense) => expense.date <= asOfDate)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const allReceivableCashFlow = data.receivableTransactions
    .filter((transaction) => transaction.date <= asOfDate)
    .reduce((sum, transaction) => sum + receivableCashMovement(transaction), 0)

  return {
    monthIncome,
    monthExpenses,
    cashBalance: data.openingCashBalance + allIncome - allExpenses + allReceivableCashFlow,
  }
}
