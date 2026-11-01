import type { Expense, House, LedgerData, Payment, ReceivableTransaction, ResidenceStatus, Tariff } from '../types'
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

export async function loadRemoteLedger(): Promise<LedgerData> {
  const client = requireClient()
  const { data: sessionData } = await client.auth.getSession()
  const publicPaymentFields = [
    'id', 'house_id', 'period_month', 'payment_date', 'mandatory_amount',
    'arrears_amount', 'extra_amount', 'extra_type',
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
  const pendingSetting = settings.get('pending_payment_months')
  const pendingPaymentMonths = Array.isArray(pendingSetting)
    ? pendingSetting.filter((item): item is { houseId: number; month: string; notes: string } =>
      typeof item === 'object' && item !== null &&
      typeof (item as { houseId?: unknown }).houseId === 'number' &&
      typeof (item as { month?: unknown }).month === 'string' &&
      typeof (item as { notes?: unknown }).notes === 'string')
    : [{ houseId: 4, month: '2026-04', notes: 'Penghuni menyatakan sudah membayar; menunggu bukti pembayaran.' }]

  return {
    houses,
    tariffs,
    payments,
    expenses,
    receivableTransactions,
    openingCashBalance: settingNumber(settings, 'opening_cash_balance', 0),
    jointFee0203: settingNumber(settings, 'joint_fee_02_03', DEFAULT_JOINT_FEE),
    bankName: settingText(settings, 'bank_name', 'Bank Neo Commerce'),
    bankAccountNumber: settingText(settings, 'bank_account_number', '5859457243882555'),
    bankAccountHolder: settingText(settings, 'bank_account_holder', 'Suwondo'),
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

export async function updateRemoteHouse(house: House) {
  const { error } = await requireClient().from('houses').update({
    owner_name: house.owner,
    residence_status: house.residenceStatus,
    tenant_name: house.tenant || null,
    rental_start_date: house.rentalStartDate || null,
    opening_arrears: house.openingArrears,
    monthly_fee_override: house.monthlyFeeOverride,
    billing_start_month: `${house.billingStartMonth}-01`,
  }).eq('id', house.id)
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
