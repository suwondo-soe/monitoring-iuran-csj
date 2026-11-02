import type {
  Expense, House, HouseOccupancy, LedgerData, OpeningArrearsItem, OpeningArrearsPayment, Payment,
  ReceivableTransaction, ResidenceStatus, Tariff,
} from '../types'
import { DEFAULT_JOINT_FEE } from '../domain'
import { supabase } from './supabase'

type HouseRow = {
  id: number
  house_no: string
  owner_name: string
  residence_status: ResidenceStatus
  tenant_name: string | null
  rental_start_date: string | null
  opening_arrears: number | string
  monthly_fee_override: number | string | null
  billing_start_month?: string | null
}

type PaymentRow = {
  id: string
  house_id: number
  period_month: string
  payment_date: string
  mandatory_amount: number | string
  arrears_amount: number | string
  extra_amount: number | string
  extra_type: string
  payment_method?: string | null
  notes?: string | null
  opening_arrears_item_id?: string | null
}

type OccupancyRow = {
  id: string
  house_id: number
  occupant_name: string
  occupant_role: 'owner' | 'tenant'
  start_date: string
  end_date: string | null
  notes: string | null
}

type OpeningArrearsRow = {
  id: string
  house_id: number | null
  occupancy_id: string | null
  debtor_name: string
  debtor_role: 'owner' | 'tenant' | 'former_tenant' | 'unassigned'
  cutoff_date: string
  original_amount: number | string
  notes: string | null
}

type OpeningArrearsPaymentRow = {
  id: string
  opening_arrears_item_id: string
  payment_date: string
  amount: number | string
  payment_method?: string | null
  notes?: string | null
}

type ExpenseRow = {
  id: string
  expense_date: string
  category: string
  detail?: string | null
  amount: number | string
  description: string | null
}

type TariffRow = {
  id: string
  effective_date: string
  occupied_fee: number | string
  empty_fee: number | string
  notes: string | null
}

type SettingRow = { key: string; value: unknown }

const requireClient = () => {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
  return supabase
}

const settingText = (settings: Map<string, unknown>, key: string, fallback: string) => {
  const value = settings.get(key)
  return typeof value === 'string' && value.trim() ? value : fallback
}

const settingNumber = (settings: Map<string, unknown>, key: string, fallback: number) => {
  const value = Number(settings.get(key))
  return Number.isFinite(value) ? value : fallback
}

const publicOccupancyValue = (occupancies: HouseOccupancy[]) => occupancies.map((item) => ({
  id: item.id,
  houseId: item.houseId,
  occupantName: item.occupantName,
  occupantRole: item.occupantRole,
  startDate: item.startDate,
  endDate: item.endDate,
}))

const publicOccupanciesFromSetting = (value: unknown): HouseOccupancy[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string'
      || typeof row.houseId !== 'number'
      || typeof row.occupantName !== 'string'
      || (row.occupantRole !== 'owner' && row.occupantRole !== 'tenant')
      || typeof row.startDate !== 'string') return []
    return [{
      id: row.id,
      houseId: row.houseId,
      occupantName: row.occupantName,
      occupantRole: row.occupantRole,
      startDate: row.startDate,
      endDate: typeof row.endDate === 'string' ? row.endDate : '',
      notes: '',
    }]
  })
}

async function syncPublicOccupancyHistory() {
  const client = requireClient()
  const { data, error } = await client.from('house_occupancies')
    .select('id,house_id,occupant_name,occupant_role,start_date,end_date')
    .order('start_date', { ascending: false })
  if (error) throw error
  const occupancies = (data as unknown as OccupancyRow[]).map((row): HouseOccupancy => ({
    id: row.id,
    houseId: row.house_id,
    occupantName: row.occupant_name,
    occupantRole: row.occupant_role,
    startDate: row.start_date,
    endDate: row.end_date ?? '',
    notes: '',
  }))
  const { error: settingError } = await client.from('app_settings').upsert({
    key: 'public_occupancy_history',
    value: publicOccupancyValue(occupancies),
  })
  if (settingError) throw settingError
}

export async function loadRemoteLedger(): Promise<LedgerData> {
  const client = requireClient()
  const { data: sessionData } = await client.auth.getSession()
  const publicPaymentFields = [
    'id', 'house_id', 'period_month', 'payment_date', 'mandatory_amount',
    'arrears_amount', 'extra_amount', 'extra_type', 'opening_arrears_item_id',
  ].join(',')
  const paymentFields = sessionData.session
    ? `${publicPaymentFields},payment_method,notes`
    : publicPaymentFields
  const [housesResult, tariffsResult, paymentsResult, expensesResult, settingsResult] =
    await Promise.all([
      client.from('houses').select('*').order('id'),
      client.from('tariff_history').select('*').order('effective_date'),
      client.from('payments').select(paymentFields).order('payment_date', { ascending: false }),
      client.from('expenses').select('*').order('expense_date', { ascending: false }),
      client.from('app_settings').select('key,value'),
    ])

  const error = housesResult.error ?? tariffsResult.error ?? paymentsResult.error ??
    expensesResult.error ?? settingsResult.error
  if (error) throw error

  let houseOccupancies: HouseOccupancy[] = []
  const publicArrearsFields = 'id,house_id,debtor_name,debtor_role,cutoff_date,original_amount'
  const arrearsResult = await client.from('opening_arrears_items')
    .select(sessionData.session ? '*' : publicArrearsFields)
    .order('cutoff_date', { ascending: false })
  if (arrearsResult.error) throw arrearsResult.error
  const openingArrearsItems: OpeningArrearsItem[] = (arrearsResult.data as unknown as OpeningArrearsRow[]).map((row) => ({
    id: row.id,
    houseId: row.house_id,
    occupancyId: row.occupancy_id ?? null,
    debtorName: row.debtor_name,
    debtorRole: row.debtor_role,
    cutoffDate: row.cutoff_date,
    originalAmount: Number(row.original_amount),
    notes: row.notes ?? '',
  }))
  const publicArrearsPaymentFields = 'id,opening_arrears_item_id,payment_date,amount'
  const arrearsPaymentsResult = await client.from('opening_arrears_payments')
    .select(sessionData.session ? '*' : publicArrearsPaymentFields)
    .order('payment_date', { ascending: false })
  if (arrearsPaymentsResult.error) throw arrearsPaymentsResult.error
  const openingArrearsPayments: OpeningArrearsPayment[] = (arrearsPaymentsResult.data as unknown as OpeningArrearsPaymentRow[]).map((row) => ({
    id: row.id,
    openingArrearsItemId: row.opening_arrears_item_id,
    paymentDate: row.payment_date,
    amount: Number(row.amount),
    method: row.payment_method ?? '',
    notes: row.notes ?? '',
  }))
  const publicOccupancyFields = 'id,house_id,occupant_name,occupant_role,start_date,end_date'
  const occupanciesResult = await client.from('house_occupancies')
    .select(sessionData.session ? '*' : publicOccupancyFields)
    .order('start_date', { ascending: false })
  if (occupanciesResult.error && sessionData.session) throw occupanciesResult.error
  if (!occupanciesResult.error) {
    houseOccupancies = (occupanciesResult.data as unknown as OccupancyRow[]).map((row) => ({
      id: row.id,
      houseId: row.house_id,
      occupantName: row.occupant_name,
      occupantRole: row.occupant_role,
      startDate: row.start_date,
      endDate: row.end_date ?? '',
      notes: row.notes ?? '',
    }))
  }

  const houses = (housesResult.data as HouseRow[]).map((row): House => ({
    id: row.id,
    number: row.house_no,
    owner: row.owner_name,
    residenceStatus: row.residence_status,
    tenant: row.tenant_name ?? '',
    rentalStartDate: row.rental_start_date ?? '',
    openingArrears: Number(row.opening_arrears),
    monthlyFeeOverride: row.monthly_fee_override === null ? null : Number(row.monthly_fee_override),
    billingStartMonth: row.billing_start_month?.slice(0, 7) ?? (row.id === 6 ? '2026-05' : row.id === 12 ? '2026-08' : '2026-01'),
  }))

  const tariffs = (tariffsResult.data as TariffRow[]).map((row): Tariff => ({
    id: row.id,
    effectiveDate: row.effective_date,
    occupiedFee: Number(row.occupied_fee),
    emptyFee: Number(row.empty_fee),
    notes: row.notes ?? '',
  }))

  const payments = (paymentsResult.data as unknown as PaymentRow[]).map((row): Payment => ({
    id: row.id,
    houseId: row.house_id,
    month: row.period_month.slice(0, 7),
    paymentDate: row.payment_date,
    mandatoryAmount: Number(row.mandatory_amount),
    arrearsAmount: Number(row.arrears_amount),
    extraAmount: Number(row.extra_amount),
    extraType: row.extra_type,
    method: row.payment_method ?? '',
    notes: row.notes ?? '',
    openingArrearsItemId: row.opening_arrears_item_id ?? null,
  }))

  const expenseRows = expensesResult.data as ExpenseRow[]
  const expenses = expenseRows.filter((row) => row.category !== 'Piutang' && row.category !== 'Pelunasan Piutang').map((row): Expense => ({
    id: row.id,
    date: row.expense_date,
    category: row.category,
    detail: row.detail ?? '',
    amount: Number(row.amount),
    description: row.description ?? '',
  }))

  const receivableTransactions = expenseRows.filter((row) => row.category === 'Piutang' || row.category === 'Pelunasan Piutang').map((row): ReceivableTransaction => ({
    id: row.id,
    date: row.expense_date,
    transactionType: row.category === 'Pelunasan Piutang' ? 'repayment' : 'disbursement',
    debtor: (row.detail ?? 'Lainnya').replace(/^Piutang ke /, '').replace(/^Piutang /, ''),
    amount: Number(row.amount),
    description: row.description ?? '',
  }))

  const settings = new Map(
    (settingsResult.data as SettingRow[]).map((row) => [row.key, row.value]),
  )
  if (!houseOccupancies.length) {
    houseOccupancies = publicOccupanciesFromSetting(settings.get('public_occupancy_history'))
  }
  if (sessionData.session) await syncPublicOccupancyHistory()
  const pendingSetting = settings.get('pending_payment_months')
  const pendingPaymentMonths = (Array.isArray(pendingSetting)
    ? pendingSetting.filter((item): item is { houseId: number; month: string; notes: string } =>
      typeof item === 'object' && item !== null &&
      typeof (item as { houseId?: unknown }).houseId === 'number' &&
      typeof (item as { month?: unknown }).month === 'string' &&
      typeof (item as { notes?: unknown }).notes === 'string')
    : []).filter((item) => !(item.houseId === 4 && item.month === '2026-04'))

  return {
    houses,
    houseOccupancies,
    openingArrearsItems,
    openingArrearsPayments,
    tariffs,
    payments,
    expenses,
    receivableTransactions,
    openingCashBalance: settingNumber(settings, 'opening_cash_balance', 0),
    jointFee0203: settingNumber(settings, 'joint_fee_02_03', DEFAULT_JOINT_FEE),
    bankName: settingText(settings, 'bank_name', 'Bank Neo Commerce'),
    bankAccountNumber: settingText(settings, 'bank_account_number', '5859457243882555'),
    bankAccountHolder: settingText(settings, 'bank_account_holder', 'Suwondo'),
    reportYearEnd: Math.max(2030, settingNumber(settings, 'report_year_end', 2030)),
    pendingPaymentMonths,
  }
}

export async function createRemotePayments(payments: Payment[]) {
  const rows = payments.map((payment) => ({
    id: payment.id,
    house_id: payment.houseId,
    period_month: `${payment.month}-01`,
    payment_date: payment.paymentDate,
    mandatory_amount: payment.mandatoryAmount,
    arrears_amount: payment.arrearsAmount,
    extra_amount: payment.extraAmount,
    extra_type: payment.extraType,
    payment_method: payment.method,
    notes: payment.notes || null,
    opening_arrears_item_id: payment.openingArrearsItemId || null,
  }))
  const { error } = await requireClient().from('payments').insert(rows)
  if (error) throw error
}

export async function deleteRemotePayment(id: string) {
  const { error } = await requireClient().from('payments').delete().eq('id', id)
  if (error) throw error
}

export async function updateRemotePayment(payment: Payment) {
  const { error } = await requireClient().from('payments').update({
    house_id: payment.houseId,
    period_month: `${payment.month}-01`,
    payment_date: payment.paymentDate,
    mandatory_amount: payment.mandatoryAmount,
    arrears_amount: payment.arrearsAmount,
    extra_amount: payment.extraAmount,
    extra_type: payment.extraType,
    payment_method: payment.method,
    notes: payment.notes || null,
    opening_arrears_item_id: payment.openingArrearsItemId || null,
  }).eq('id', payment.id)
  if (error) throw error
}

export async function createRemoteExpense(expense: Expense) {
  const { error } = await requireClient().from('expenses').insert({
    id: expense.id,
    expense_date: expense.date,
    category: expense.category,
    detail: expense.detail,
    amount: expense.amount,
    description: expense.description || null,
  })
  if (error) throw error
}

export async function deleteRemoteExpense(id: string) {
  const { error } = await requireClient().from('expenses').delete().eq('id', id)
  if (error) throw error
}

export async function updateRemoteExpense(expense: Expense) {
  const { error } = await requireClient().from('expenses').update({
    expense_date: expense.date,
    category: expense.category,
    detail: expense.detail,
    amount: expense.amount,
    description: expense.description || null,
  }).eq('id', expense.id)
  if (error) throw error
}

export async function createRemoteReceivableTransaction(transaction: ReceivableTransaction) {
  const { error } = await requireClient().from('expenses').insert({
    id: transaction.id,
    expense_date: transaction.date,
    category: transaction.transactionType === 'disbursement' ? 'Piutang' : 'Pelunasan Piutang',
    detail: transaction.debtor,
    amount: transaction.amount,
    description: transaction.description || null,
  })
  if (error) throw error
}

export async function deleteRemoteReceivableTransaction(id: string) {
  const { error } = await requireClient().from('expenses').delete().eq('id', id)
  if (error) throw error
}

export async function updateRemoteReceivableTransaction(transaction: ReceivableTransaction) {
  const { error } = await requireClient().from('expenses').update({
    expense_date: transaction.date,
    category: transaction.transactionType === 'disbursement' ? 'Piutang' : 'Pelunasan Piutang',
    detail: transaction.debtor,
    amount: transaction.amount,
    description: transaction.description || null,
  }).eq('id', transaction.id)
  if (error) throw error
}

export async function createRemoteTariff(tariff: Tariff) {
  const { error } = await requireClient().from('tariff_history').insert({
    id: tariff.id,
    effective_date: tariff.effectiveDate,
    occupied_fee: tariff.occupiedFee,
    empty_fee: tariff.emptyFee,
    notes: tariff.notes || null,
  })
  if (error) throw error
}

export async function updateRemoteHouse(house: House, changeDate = new Date().toISOString().slice(0, 10)) {
  const client = requireClient()
  const { data: previous, error: previousError } = await client.from('houses')
    .select('owner_name,residence_status,tenant_name')
    .eq('id', house.id)
    .single()
  if (previousError) throw previousError

  const { error } = await client.from('houses').update({
    owner_name: house.owner,
    residence_status: house.residenceStatus,
    tenant_name: house.tenant || null,
    rental_start_date: house.rentalStartDate || null,
    opening_arrears: house.openingArrears,
    monthly_fee_override: house.monthlyFeeOverride,
    billing_start_month: `${house.billingStartMonth}-01`,
  }).eq('id', house.id)
  if (error) throw error

  const previousName = previous.residence_status === 'rented'
    ? (previous.tenant_name ?? '')
    : previous.residence_status === 'owner_occupied' ? previous.owner_name : ''
  const previousRole = previous.residence_status === 'rented' ? 'tenant' : 'owner'
  const nextName = house.residenceStatus === 'rented'
    ? house.tenant
    : house.residenceStatus === 'owner_occupied' ? house.owner : ''
  const nextRole = house.residenceStatus === 'rented' ? 'tenant' : 'owner'
  if (previousName.trim() === nextName.trim() && previousRole === nextRole) return

  const { data: activeOccupancy, error: activeError } = await client.from('house_occupancies')
    .select('id,start_date')
    .eq('house_id', house.id)
    .is('end_date', null)
    .maybeSingle()
  if (activeError) throw activeError
  if (activeOccupancy) {
    if (changeDate <= activeOccupancy.start_date) {
      throw new Error(`Tanggal mulai penanggung jawab baru harus setelah ${activeOccupancy.start_date}.`)
    }
    const priorDate = new Date(`${changeDate}T12:00:00Z`)
    priorDate.setUTCDate(priorDate.getUTCDate() - 1)
    const previousEndDate = priorDate.toISOString().slice(0, 10)
    const { error: closeError } = await client.from('house_occupancies')
      .update({ end_date: previousEndDate })
      .eq('id', activeOccupancy.id)
    if (closeError) throw closeError
  }
  if (nextName.trim()) {
    const { error: insertError } = await client.from('house_occupancies').insert({
      house_id: house.id,
      occupant_name: nextName.trim(),
      occupant_role: nextRole,
      start_date: changeDate,
      notes: 'Dibuat otomatis dari perubahan data rumah',
    })
    if (insertError) throw insertError
  }
  await syncPublicOccupancyHistory()
}

export async function createRemoteOccupancy(occupancy: HouseOccupancy) {
  const { error } = await requireClient().from('house_occupancies').insert({
    id: occupancy.id,
    house_id: occupancy.houseId,
    occupant_name: occupancy.occupantName,
    occupant_role: occupancy.occupantRole,
    start_date: occupancy.startDate,
    end_date: occupancy.endDate || null,
    notes: occupancy.notes || null,
  })
  if (error) throw error
  await syncPublicOccupancyHistory()
}

export async function deleteRemoteOccupancy(id: string) {
  const { error } = await requireClient().from('house_occupancies').delete().eq('id', id)
  if (error) throw error
  await syncPublicOccupancyHistory()
}

export async function createRemoteOpeningArrearsItem(item: OpeningArrearsItem) {
  const { error } = await requireClient().from('opening_arrears_items').insert({
    id: item.id,
    house_id: item.houseId,
    occupancy_id: item.occupancyId,
    debtor_name: item.debtorName,
    debtor_role: item.debtorRole,
    cutoff_date: item.cutoffDate,
    original_amount: item.originalAmount,
    notes: item.notes || null,
  })
  if (error) throw error
}

export async function deleteRemoteOpeningArrearsItem(id: string) {
  const { error } = await requireClient().from('opening_arrears_items').delete().eq('id', id)
  if (error) throw error
}

export async function createRemoteOpeningArrearsPayment(payment: OpeningArrearsPayment) {
  const { error } = await requireClient().from('opening_arrears_payments').insert({
    id: payment.id,
    opening_arrears_item_id: payment.openingArrearsItemId,
    payment_date: payment.paymentDate,
    amount: payment.amount,
    payment_method: payment.method,
    notes: payment.notes || null,
  })
  if (error) throw error
}

export async function updateRemoteOpeningArrearsPayment(payment: OpeningArrearsPayment) {
  const { error } = await requireClient().from('opening_arrears_payments').update({
    opening_arrears_item_id: payment.openingArrearsItemId,
    payment_date: payment.paymentDate,
    amount: payment.amount,
    payment_method: payment.method,
    notes: payment.notes || null,
  }).eq('id', payment.id)
  if (error) throw error
}

export async function deleteRemoteOpeningArrearsPayment(id: string) {
  const { error } = await requireClient().from('opening_arrears_payments').delete().eq('id', id)
  if (error) throw error
}

export async function updateRemoteSettings(settings: Record<string, string | number>) {
  const rows = Object.entries(settings).map(([key, value]) => ({ key, value }))
  const { error } = await requireClient().from('app_settings').upsert(rows)
  if (error) throw error
}

export async function currentUserIsAdmin() {
  const client = requireClient()
  const { data: sessionData } = await client.auth.getSession()
  if (!sessionData.session) return false
  const { data, error } = await client.from('profiles').select('role')
    .eq('user_id', sessionData.session.user.id).maybeSingle()
  if (error) throw error
  return data?.role === 'admin'
}
