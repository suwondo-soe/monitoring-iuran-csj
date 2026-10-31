import type { Expense, House, LedgerData, Payment, ResidenceStatus } from '../types'
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
  amount: number | string
  description: string | null
}

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadRemoteLedger(): Promise<LedgerData> {
  const client = requireClient()
  const { data: sessionData } = await client.auth.getSession()
  const publicPaymentFields = [
    'id',
    'house_id',
    'period_month',
    'payment_date',
    'mandatory_amount',
    'arrears_amount',
    'extra_amount',
    'extra_type',
  ].join(',')
  const paymentFields = sessionData.session
    ? `${publicPaymentFields},payment_method,notes`
    : publicPaymentFields
  const [housesResult, paymentsResult, expensesResult, settingsResult] =
    await Promise.all([
      client.from('houses').select('*').order('id'),
      client
        .from('payments')
        .select(paymentFields)
        .order('payment_date', { ascending: false }),
      client.from('expenses').select('*').order('expense_date', { ascending: false }),
      client.from('app_settings').select('value').eq('key', 'opening_cash_balance').maybeSingle(),
    ])

  const error =
    housesResult.error ??
    paymentsResult.error ??
    expensesResult.error ??
    settingsResult.error
  if (error) throw error

  const houses = (housesResult.data as HouseRow[]).map(
    (row): House => ({
      id: row.id,
      number: row.house_no,
      owner: row.owner_name,
      residenceStatus: row.residence_status,
      tenant: row.tenant_name ?? '',
      rentalStartDate: row.rental_start_date ?? '',
      openingArrears: Number(row.opening_arrears),
      monthlyFeeOverride:
        row.monthly_fee_override === null ? null : Number(row.monthly_fee_override),
    }),
  )

  const payments = (paymentsResult.data as unknown as PaymentRow[]).map(
    (row): Payment => ({
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
    }),
  )

  const expenses = (expensesResult.data as ExpenseRow[]).map(
    (row): Expense => ({
      id: row.id,
      date: row.expense_date,
      category: row.category,
      amount: Number(row.amount),
      description: row.description ?? '',
    }),
  )

  return {
    houses,
    payments,
    expenses,
    openingCashBalance: Number(settingsResult.data?.value ?? 0),
  }
}

export async function createRemotePayment(payment: Payment) {
  const { error } = await requireClient().from('payments').insert({
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
  })
  if (error) throw error
}

export async function createRemoteExpense(expense: Expense) {
  const { error } = await requireClient().from('expenses').insert({
    id: expense.id,
    expense_date: expense.date,
    category: expense.category,
    amount: expense.amount,
    description: expense.description || null,
  })
  if (error) throw error
}

export async function updateRemoteHouse(house: House) {
  const { error } = await requireClient()
    .from('houses')
    .update({
      owner_name: house.owner,
      residence_status: house.residenceStatus,
      tenant_name: house.tenant || null,
      rental_start_date: house.rentalStartDate || null,
      opening_arrears: house.openingArrears,
      monthly_fee_override: house.monthlyFeeOverride,
    })
    .eq('id', house.id)
  if (error) throw error
}

export async function updateRemoteOpeningBalance(value: number) {
  const { error } = await requireClient().from('app_settings').upsert({
    key: 'opening_cash_balance',
    value,
  })
  if (error) throw error
}

export async function currentUserIsAdmin() {
  const client = requireClient()
  const { data: sessionData } = await client.auth.getSession()
  if (!sessionData.session) return false

  const { data, error } = await client
    .from('profiles')
    .select('role')
    .eq('user_id', sessionData.session.user.id)
    .maybeSingle()
  if (error) throw error
  return data?.role === 'admin'
}
