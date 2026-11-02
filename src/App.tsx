import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft, Banknote, BookOpen, Building2, CalendarDays, Check, CheckCircle2, CircleAlert,
  Copy, CreditCard, Home, LogIn, LogOut, Pencil, PiggyBank, Plus, ReceiptText, Search, Settings2, ShieldCheck,
  Trash2, TrendingUp, Users, WalletCards, X,
} from 'lucide-react'
import './App.css'
import {
  buildBillingAccounts, cashSummary, DEFAULT_EMPTY_FEE, DEFAULT_JOINT_FEE,
  DEFAULT_OCCUPIED_FEE, monthLabel, monthlyFeeForAccount, receivableCashMovement,
  statementForAccount, tariffForMonth,
} from './domain'
import {
  createRemoteExpense, createRemoteOccupancy, createRemoteOpeningArrearsItem, createRemotePayments,
  createRemoteOpeningArrearsPayment, createRemoteReceivableTransaction, createRemoteTariff, currentUserIsAdmin, deleteRemoteExpense,
  deleteRemoteOccupancy, deleteRemoteOpeningArrearsItem, deleteRemoteOpeningArrearsPayment, deleteRemotePayment,
  deleteRemoteReceivableTransaction, loadRemoteLedger, updateRemoteExpense, updateRemoteHouse,
  setRemoteOpeningArrearsTotal, updateRemoteOpeningArrearsPayment, updateRemotePayment, updateRemoteReceivableTransaction, updateRemoteSettings,
} from './lib/ledgerRepository'
import { supabase, supabaseConfigured } from './lib/supabase'
import type {
  AdminView, ArrearsDebtorRole, BillingAccount, Expense, House, HouseOccupancy, LedgerData,
  OpeningArrearsItem, OpeningArrearsPayment, Payment, PendingPaymentMonth, PublicView, ReceivableTransaction,
  ResidenceStatus, Tariff,
} from './types'

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const currentMonth = today.slice(0, 7)
const pageOpenedLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(now)
const paymentYears = Array.from({ length: 10 }, (_, index) => 2026 + index)
const paymentMonths = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, index, 1)),
}))

const nextMonthValue = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(year, monthNumber, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const people = [
  'Dwi Nanung/Ayu', 'Anky/Glady', 'Anky/Glady', 'Qomar/Intan Widya', 'Muh. Basyir/Ova',
  'Irfan/Windi', 'Desis/Koko', 'Melda NyataJaya', 'Sigit', 'Hakim/Indah', 'Yuli Adi/Lisa',
  'Fadel', 'Nasrul', 'Rahmad/Wety', 'Ferdian/Yayah', 'Sepino/Prima', 'Dede/Mega',
  'Adib A. Rahman', 'Deny Haryanto', 'Dwi Pratiknyo', 'Robien', 'Suwondo', 'Oma', 'Tika',
  'Aldhi Givvari', 'Ahmad Budiarjo 1', 'Ahmad Budiarjo 2', 'Rolandi Situmorang',
  'Arif Rifana/Gina', 'Frans', 'Fiqih/Asih', 'Yusron', 'Rama', 'Nunik',
  'Rosyidi/Anizar 1', 'Rosyidi/Anizar 1',
]
const emptyIds = new Set([20, 24, 28, 33])
const rented: Record<number, string> = {
  1: 'Ardani/Amelia', 8: 'Farid/Yanne', 9: 'M. Andi/Nisa', 12: 'Jihad/Risa',
  26: 'Babay/Lina', 27: 'Ismail', 30: 'Aria Marta', 36: 'Angga/Intan Andriani',
}
const seedHouses: House[] = people.map((owner, index) => {
  const id = index + 1
  const residenceStatus: ResidenceStatus = emptyIds.has(id) ? 'empty' : rented[id] ? 'rented' : 'owner_occupied'
  return {
    id, number: `CSJ ${id}`, owner, residenceStatus, tenant: rented[id] ?? '',
    rentalStartDate: rented[id] ? '2026-01-01' : '', openingArrears: 0,
    monthlyFeeOverride: id === 2 || id === 3 ? 157_500 : null,
    billingStartMonth: id === 6 ? '2026-05' : id === 12 ? '2026-08' : '2026-01',
  }
})

const seedLedger: LedgerData = {
  houses: seedHouses, houseOccupancies: [], openingArrearsItems: [], openingArrearsPayments: [],
  tariffs: [{ id: 'initial', effectiveDate: '2026-01-01', occupiedFee: DEFAULT_OCCUPIED_FEE, emptyFee: DEFAULT_EMPTY_FEE, notes: 'Tarif awal CSJ' }],
  payments: [], expenses: [], receivableTransactions: [], openingCashBalance: 0, jointFee0203: DEFAULT_JOINT_FEE,
  bankName: 'Bank Neo Commerce', bankAccountNumber: '5859457243882555', bankAccountHolder: 'Suwondo',
  pendingPaymentMonths: [],
}

const residenceLabel: Record<ResidenceStatus, string> = {
  owner_occupied: 'Dihuni pemilik', rented: 'Disewa', empty: 'Kosong',
}
const occupantRoleLabel = { owner: 'Pemilik', tenant: 'Penyewa' } as const
const arrearsDebtorRoleLabel: Record<ArrearsDebtorRole, string> = {
  owner: 'Pemilik', tenant: 'Penyewa', former_tenant: 'Mantan penyewa', unassigned: 'Belum dialokasikan',
}
const expenseDetailsByCategory: Record<string, string[]> = {
  Beban: [
    'Beban Security', 'Beban Sampah', 'Beban Pembangunan', 'Beban Sosial',
    'Beban Air', 'Beban Listrik', 'Beban Sumbangan', 'Beban Lain-Lain', 'Beban Administrasi',
  ],
  Lainnya: ['Lainnya'],
}
const receivableDebtors = [
  'Pak Idris', 'Pak Yoyon', 'Pak Wisnu', 'Pak Amsari', 'Mang Atta', 'Lainnya',
]
const otherReceiptTypes = [
  'Denda', 'Sumbangan', 'Program A', 'Program B', 'Program C',
  'Iuran Ramadhan+Idul Fitri', 'Lainnya',
]
const otherFundCategories = otherReceiptTypes.filter((type) => type !== 'Denda')
const normalizeReceiptType = (value: string) =>
  otherReceiptTypes.find((type) => type.toLowerCase() === value.trim().toLowerCase()) ?? 'Lainnya'
const normalizeOtherFundCategory = (value: string) => {
  const category = normalizeReceiptType(value)
  return category === 'Denda' ? 'Lainnya' : category
}
const legacyExpenseCategory: Record<string, string> = {
  Security: 'Beban', Cleaning: 'Beban', Maintenance: 'Beban', Administration: 'Beban', Other: 'Lainnya',
}
const legacyExpenseDetail: Record<string, string> = {
  Security: 'Beban Security', Cleaning: 'Beban Sampah', Maintenance: 'Beban Pembangunan',
  Administration: 'Beban Administrasi', Other: 'Lainnya',
}

type CashJournalEntry = {
  id: string
  entityId: string
  entityType: 'payment-dues' | 'payment-other' | 'opening-arrears' | 'expense' | 'receivable'
  date: string
  source: 'Penerimaan' | 'Pengeluaran' | 'Piutang'
  category: string
  detail: string
  description: string
  cashIn: number
  cashOut: number
  runningBalance: number
}

type JournalEditForm = {
  entry: CashJournalEntry
  date: string
  month: string
  mandatoryAmount: string
  arrearsAmount: string
  extraAmount: string
  extraType: string
  method: string
  category: string
  detail: string
  amount: string
  debtor: string
  transactionType: 'disbursement' | 'repayment'
  notes: string
}

function StatusGrid({ accounts, selectedId, onSelect }: {
  accounts: ReturnType<typeof statementForAccount>[]
  selectedId: string
  onSelect: (account: BillingAccount) => void
}) {
  return <div className="status-grid">
    {accounts.map((account) => <button
      className={`status-house ${account.isPaid ? 'paid' : 'due'} ${selectedId === account.id ? 'selected' : ''}`}
      key={account.id} onClick={() => onSelect(account)} type="button"
      aria-label={`${account.code}, ${account.isPaid ? 'lunas' : 'belum lunas'}`}
    >
      <strong>{account.shortCode}</strong>
      <span>{account.isPaid ? <Check size={13} /> : null}{account.isPaid ? 'Lunas' : 'Belum'}</span>
    </button>)}
  </div>
}

type OtherFundAccountRow = {
  account: BillingAccount
  balances: Map<string, number>
  total: number
}

function OtherFundAccountGrid({ rows, selectedId, onSelect }: {
  rows: OtherFundAccountRow[]
  selectedId: string
  onSelect: (account: BillingAccount) => void
}) {
  return <div className="other-fund-account-grid">
    {rows.map(({ account, total }) => <button
      className={`other-fund-account ${selectedId === account.id ? 'selected' : ''}`}
      key={account.id} onClick={() => onSelect(account)} type="button"
      aria-label={`${account.code}, saldo ${rupiah.format(total)}`}
    >
      <span>{account.code}</span><strong>{rupiah.format(total)}</strong><small>{account.residentName}</small>
    </button>)}
  </div>
}

function App() {
  const [data, setData] = useState<LedgerData>(seedLedger)
  const [activeMonth] = useState(currentMonth < '2026-01' ? '2026-01' : currentMonth)
  const [publicView, setPublicView] = useState<PublicView>('overview')
  const [adminView, setAdminView] = useState<AdminView>('payments')
  const [mode, setMode] = useState<'public' | 'admin'>('public')
  const [selectedAccountId, setSelectedAccountId] = useState('account-01')
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [showRecap, setShowRecap] = useState(false)
  const [showOtherFundDetail, setShowOtherFundDetail] = useState(false)
  const [selectedOtherFundAccountId, setSelectedOtherFundAccountId] = useState('account-01')
  const [recapYear, setRecapYear] = useState(Math.min(2028, Math.max(2026, now.getFullYear())))
  const [reportYear, setReportYear] = useState(Math.max(2026, now.getFullYear()))
  const [maxReportYear, setMaxReportYear] = useState(Math.max(2028, now.getFullYear()))
  const [copied, setCopied] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [paymentForm, setPaymentForm] = useState({
    receiptKind: 'dues',
    paymentDate: today,
    periods: [{ month: activeMonth, mandatory: '0' }],
    arrears: '0', openingArrearsItemId: '', otherPeriod: activeMonth, otherAmount: '',
    extraType: 'Denda', method: 'Transfer', notes: '',
  })
  const [expenseForm, setExpenseForm] = useState({ date: today, category: 'Beban', detail: 'Beban Security', amount: '', description: '' })
  const [receivableForm, setReceivableForm] = useState({ date: today, transactionType: 'disbursement' as 'disbursement' | 'repayment', debtor: 'Pak Idris', amount: '', description: '' })
  const [settingsForm, setSettingsForm] = useState({ openingCashBalance: '0', jointFee0203: String(DEFAULT_JOINT_FEE), bankName: '', bankAccountNumber: '', bankAccountHolder: '' })
  const [tariffForm, setTariffForm] = useState({ effectiveDate: `${activeMonth}-01`, occupiedFee: String(DEFAULT_OCCUPIED_FEE), emptyFee: String(DEFAULT_EMPTY_FEE), notes: '' })
  const [houseQuery, setHouseQuery] = useState('')
  const [openingArrearsDrafts, setOpeningArrearsDrafts] = useState<Record<string, string>>({})
  const [arrearsForm, setArrearsForm] = useState({
    houseId: '', debtorName: '', debtorRole: 'former_tenant' as ArrearsDebtorRole,
    cutoffDate: '2025-12-31', originalAmount: '', notes: '',
  })
  const [arrearsPaymentForm, setArrearsPaymentForm] = useState({
    openingArrearsItemId: '', paymentDate: today, amount: '', method: 'Transfer', notes: '',
  })
  const [occupancyForm, setOccupancyForm] = useState({
    houseId: '1', occupantName: '', occupantRole: 'tenant' as 'owner' | 'tenant',
    startDate: '2025-01-01', endDate: '2025-12-31', notes: '',
  })
  const [journalQuery, setJournalQuery] = useState('')
  const [journalYear, setJournalYear] = useState('all')
  const [journalMonth, setJournalMonth] = useState('all')
  const [journalSort, setJournalSort] = useState<'asc' | 'desc'>('asc')
  const [journalEdit, setJournalEdit] = useState<JournalEditForm | null>(null)

  const loadData = async () => {
    setLoading(true); setError('')
    try {
      const loadedLedger = supabaseConfigured ? await loadRemoteLedger() : JSON.parse(localStorage.getItem('csj-ledger-v2') || 'null') ?? seedLedger
      const ledger: LedgerData = {
        ...loadedLedger,
        houseOccupancies: loadedLedger.houseOccupancies ?? [],
        openingArrearsItems: loadedLedger.openingArrearsItems ?? [],
        openingArrearsPayments: loadedLedger.openingArrearsPayments ?? [],
        receivableTransactions: loadedLedger.receivableTransactions ?? [],
        pendingPaymentMonths: (loadedLedger.pendingPaymentMonths ?? []).filter((item: PendingPaymentMonth) =>
          !(item.houseId === 4 && item.month === '2026-04'),
        ),
      }
      setData(ledger)
      setSettingsForm({
        openingCashBalance: String(ledger.openingCashBalance), jointFee0203: String(ledger.jointFee0203),
        bankName: ledger.bankName, bankAccountNumber: ledger.bankAccountNumber, bankAccountHolder: ledger.bankAccountHolder,
      })
      setCanEdit(supabaseConfigured ? await currentUserIsAdmin() : true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Data belum dapat dimuat.')
    } finally { setLoading(false) }
  }

  // Initial loading intentionally synchronizes React with Supabase/local storage.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadData() }, [])
  useEffect(() => {
    if (!supabaseConfigured) localStorage.setItem('csj-ledger-v2', JSON.stringify(data))
  }, [data])
  useEffect(() => {
    if (!supabase) return
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void loadData() })
    return () => listener.subscription.unsubscribe()
  }, [])

  const accounts = useMemo(() => buildBillingAccounts(data.houses), [data.houses])
  const statements = useMemo(() => accounts.map((account) => statementForAccount(account, data, activeMonth)), [accounts, data, activeMonth])
  const selected = statements.find((account) => account.id === selectedAccountId) ?? statements[0]
  const openingArrearsBalances = useMemo(() => data.openingArrearsItems.map((item) => {
    const legacySettled = data.payments
      .filter((payment) => payment.openingArrearsItemId === item.id)
      .reduce((sum, payment) => sum + payment.arrearsAmount, 0)
    const dedicatedSettled = data.openingArrearsPayments
      .filter((payment) => payment.openingArrearsItemId === item.id)
      .reduce((sum, payment) => sum + payment.amount, 0)
    const settled = legacySettled + dedicatedSettled
    return { ...item, settled, outstanding: Math.max(item.originalAmount - settled, 0) }
  }), [data.openingArrearsItems, data.openingArrearsPayments, data.payments])
  const selectedOpeningArrearsItems = openingArrearsBalances.filter((item) =>
    item.houseId !== null && selected.houseIds.includes(item.houseId) && item.outstanding > 0,
  )
  const totalTrackedOpeningArrears = openingArrearsBalances.reduce((sum, item) => sum + item.outstanding, 0)
  const publicOpeningArrears = [...openingArrearsBalances]
    .filter((item) => item.originalAmount > 0)
    .sort((a, b) => b.outstanding - a.outstanding || a.debtorName.localeCompare(b.debtorName))
  const outstandingOpeningArrearsCount = publicOpeningArrears.filter((item) => item.outstanding > 0).length
  const originalTrackedOpeningArrears = openingArrearsBalances.reduce((sum, item) => sum + item.originalAmount, 0)
  const settledTrackedOpeningArrears = openingArrearsBalances.reduce((sum, item) => sum + item.settled, 0)
  const arrearsMovementsFor = (itemId: string) => [
    ...data.payments
      .filter((payment) => payment.openingArrearsItemId === itemId && payment.arrearsAmount > 0)
      .map((payment) => ({ id: payment.id, date: payment.paymentDate, amount: payment.arrearsAmount, method: payment.method, notes: payment.notes })),
    ...data.openingArrearsPayments
      .filter((payment) => payment.openingArrearsItemId === itemId)
      .map((payment) => ({ id: payment.id, date: payment.paymentDate, amount: payment.amount, method: payment.method, notes: payment.notes })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const otherFunds = useMemo(() => {
    const categoryBalances = new Map(otherFundCategories.map((category) => [category, 0]))
    const accountBalances = new Map<string, Map<string, number>>()
    const allTransactions = data.payments
      .filter((payment) => payment.paymentDate <= today && payment.extraAmount > 0)
      .map((payment) => {
        const account = accounts.find((item) => item.houseIds.includes(payment.houseId))
        const category = normalizeReceiptType(payment.extraType)
        return { payment, account, category }
      })
      .sort((a, b) => b.payment.paymentDate.localeCompare(a.payment.paymentDate) || b.payment.month.localeCompare(a.payment.month))
    const transactions = allTransactions.filter((item) => item.category !== 'Denda')
    transactions.forEach(({ payment, account, category: rawCategory }) => {
      const category = normalizeOtherFundCategory(rawCategory)
      categoryBalances.set(category, (categoryBalances.get(category) ?? 0) + payment.extraAmount)
      if (account) {
        const balances = accountBalances.get(account.id) ?? new Map(otherFundCategories.map((item) => [item, 0]))
        balances.set(category, (balances.get(category) ?? 0) + payment.extraAmount)
        accountBalances.set(account.id, balances)
      }
    })
    const categories = otherFundCategories.map((category) => ({ category, balance: categoryBalances.get(category) ?? 0 }))
    const accountsWithBalances: OtherFundAccountRow[] = accounts.map((account) => {
      const balances = accountBalances.get(account.id) ?? new Map<string, number>()
      const total = otherFundCategories.reduce((sum, category) => sum + (balances.get(category) ?? 0), 0)
      return { account, balances, total }
    })
    return {
      categories,
      accounts: accountsWithBalances,
      transactions,
      allTransactions,
      total: categories.reduce((sum, item) => sum + item.balance, 0),
    }
  }, [accounts, data.payments])
  const selectedOtherFundAccount = otherFunds.accounts.find((item) => item.account.id === selectedOtherFundAccountId) ?? otherFunds.accounts[0]
  const selectedOtherFundTransactions = otherFunds.transactions.filter((item) => item.account?.id === selectedOtherFundAccount?.account.id)
  const cash = useMemo(() => cashSummary(data, activeMonth, today), [data, activeMonth])
  const activeTariff = useMemo(() => tariffForMonth(data.tariffs, activeMonth), [data.tariffs, activeMonth])
  const expected = statements.reduce((sum, account) => sum + account.monthlyDue, 0)
  const collected = statements.reduce((sum, account) => sum + account.paidThisPeriod, 0)
  const totalArrears = statements.reduce((sum, account) => sum + account.arrearsBalance, 0)
  const unpaid = statements.filter((account) => !account.isPaid).length
  const filteredHouses = data.houses.filter((house) => `${house.number} ${house.owner} ${house.tenant}`.toLowerCase().includes(houseQuery.toLowerCase()))
  const monthlyRecap = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const month = `${recapYear}-${String(index + 1).padStart(2, '0')}`
    const due = monthlyFeeForAccount(selected, data.houses, data.tariffs, data.jointFee0203, month)
    const paid = data.payments
      .filter((payment) => selected.houseIds.includes(payment.houseId) && payment.month === month)
      .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
    const outstanding = Math.max(due - paid, 0)
    const isNotApplicable = due === 0
    const isPaid = due > 0 && outstanding === 0
    const pendingReview = data.pendingPaymentMonths.find((item) =>
      selected.houseIds.includes(item.houseId) && item.month === month,
    )
    return {
      month, due, paid, outstanding, isPaid, isNotApplicable,
      isPending: Boolean(pendingReview) && outstanding > 0, pendingNotes: outstanding > 0 ? pendingReview?.notes ?? '' : '',
      isPartial: paid > 0 && outstanding > 0,
      isFuture: month > currentMonth && !isPaid,
    }
  }), [data, recapYear, selected])
  const currentRecapStatement = useMemo(
    () => statementForAccount(selected, data, currentMonth),
    [data, selected],
  )
  const availableReportYears = useMemo(() => {
    const transactionYears = [
      ...data.payments.map((payment) => Number(payment.paymentDate.slice(0, 4))),
      ...data.openingArrearsPayments.map((payment) => Number(payment.paymentDate.slice(0, 4))),
      ...data.expenses.map((expense) => Number(expense.date.slice(0, 4))),
      ...data.receivableTransactions.map((transaction) => Number(transaction.date.slice(0, 4))),
    ].filter(Number.isFinite)
    const lastYear = Math.max(maxReportYear, 2028, ...transactionYears)
    return Array.from({ length: lastYear - 2026 + 1 }, (_, index) => 2026 + index)
  }, [data, maxReportYear])
  const financialReport = useMemo(() => {
    const reportStart = `${reportYear}-01-01`
    const reportEnd = reportYear < now.getFullYear() ? `${reportYear}-12-31` : today
    const payments = data.payments.filter((payment) => payment.paymentDate >= reportStart && payment.paymentDate <= reportEnd)
    const openingArrearsPayments = data.openingArrearsPayments.filter((payment) => payment.paymentDate >= reportStart && payment.paymentDate <= reportEnd)
    const expenses = data.expenses.filter((expense) => expense.date >= reportStart && expense.date <= reportEnd && (legacyExpenseCategory[expense.category] ?? expense.category) !== 'Piutang')
    const mandatoryIncome = payments.reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
    const arrearsIncome = payments.reduce((sum, payment) => sum + payment.arrearsAmount, 0)
      + openingArrearsPayments.reduce((sum, payment) => sum + payment.amount, 0)
    const otherIncome = payments.reduce((sum, payment) => sum + payment.extraAmount, 0)
    const otherBreakdown = new Map<string, number>()
    payments.forEach((payment) => {
      if (payment.extraAmount <= 0) return
      const label = payment.extraType && payment.extraType !== 'Tidak ada' ? payment.extraType : 'Lainnya'
      otherBreakdown.set(label, (otherBreakdown.get(label) ?? 0) + payment.extraAmount)
    })
    const expenseGroups = ['Beban', 'Lainnya'].map((category) => {
      const details = new Map<string, number>()
      let total = 0
      expenses.forEach((expense) => {
        const normalizedCategory = legacyExpenseCategory[expense.category] ?? expense.category
        if (normalizedCategory !== category) return
        const detail = expense.detail || legacyExpenseDetail[expense.category] || category
        total += expense.amount
        details.set(detail, (details.get(detail) ?? 0) + expense.amount)
      })
      return { category, total, details: Array.from(details.entries()).sort(([a], [b]) => a.localeCompare(b)) }
    })
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)
    const receivablesToDate = data.receivableTransactions.filter((transaction) => transaction.date <= reportEnd)
    const receivableDetails = new Map<string, { disbursed: number; repaid: number }>()
    receivablesToDate.forEach((transaction) => {
      const current = receivableDetails.get(transaction.debtor) ?? { disbursed: 0, repaid: 0 }
      current[transaction.transactionType === 'disbursement' ? 'disbursed' : 'repaid'] += transaction.amount
      receivableDetails.set(transaction.debtor, current)
    })
    const receivableBreakdown = Array.from(receivableDetails.entries())
      .map(([debtor, values]) => ({ debtor, ...values, balance: values.disbursed - values.repaid }))
      .filter((item) => item.balance !== 0 || item.disbursed !== 0)
      .sort((a, b) => a.debtor.localeCompare(b.debtor))
    const receivableBalance = receivableBreakdown.reduce((sum, item) => sum + item.balance, 0)
    const periodReceivables = data.receivableTransactions.filter((transaction) => transaction.date >= reportStart && transaction.date <= reportEnd)
    const periodDisbursements = periodReceivables.filter((transaction) => transaction.transactionType === 'disbursement').reduce((sum, transaction) => sum + transaction.amount, 0)
    const periodRepayments = periodReceivables.filter((transaction) => transaction.transactionType === 'repayment').reduce((sum, transaction) => sum + transaction.amount, 0)
    const cumulativePayments = data.payments.filter((payment) => payment.paymentDate <= reportEnd)
    const cumulativeIncome = cumulativePayments.reduce((sum, payment) => sum + payment.mandatoryAmount + payment.arrearsAmount + payment.extraAmount, 0)
      + data.openingArrearsPayments.filter((payment) => payment.paymentDate <= reportEnd).reduce((sum, payment) => sum + payment.amount, 0)
    const cumulativeExpenses = data.expenses.filter((expense) => expense.date <= reportEnd && (legacyExpenseCategory[expense.category] ?? expense.category) !== 'Piutang').reduce((sum, expense) => sum + expense.amount, 0)
    const cumulativeReceivableCashFlow = receivablesToDate.reduce((sum, transaction) => sum + receivableCashMovement(transaction), 0)
    return {
      mandatoryIncome, arrearsIncome, duesIncome: mandatoryIncome + arrearsIncome,
      otherIncome, totalIncome: mandatoryIncome + arrearsIncome + otherIncome,
      otherBreakdown: Array.from(otherBreakdown.entries()).sort(([a], [b]) => a.localeCompare(b)),
      expenseGroups, totalExpenses, receivableBreakdown, receivableBalance,
      periodDisbursements, periodRepayments, reportEnd,
      netPosition: data.openingCashBalance + cumulativeIncome - cumulativeExpenses + cumulativeReceivableCashFlow,
    }
  }, [data, reportYear])
  const receivableBalances = useMemo(() => {
    const balances = new Map<string, number>()
    data.receivableTransactions.forEach((transaction) => {
      const movement = transaction.transactionType === 'disbursement' ? transaction.amount : -transaction.amount
      balances.set(transaction.debtor, (balances.get(transaction.debtor) ?? 0) + movement)
    })
    return balances
  }, [data.receivableTransactions])
  const cashJournal = useMemo(() => {
    const entries: Omit<CashJournalEntry, 'runningBalance'>[] = []
    const accountCodeForHouse = (houseId: number) =>
      accounts.find((account) => account.houseIds.includes(houseId))?.code ?? `CSJ ${String(houseId).padStart(2, '0')}`

    data.payments.filter((payment) => payment.paymentDate <= today).forEach((payment) => {
      const duesAmount = payment.mandatoryAmount + payment.arrearsAmount
      const accountCode = accountCodeForHouse(payment.houseId)
      const method = payment.method ? ` · ${payment.method}` : ''
      if (duesAmount > 0) entries.push({
        id: `${payment.id}-dues`, entityId: payment.id, entityType: 'payment-dues',
        date: payment.paymentDate, source: 'Penerimaan',
        category: 'Penerimaan Iuran Warga',
        detail: payment.arrearsAmount > 0 ? 'Iuran dan tunggakan' : 'Iuran bulanan',
        description: `${accountCode} · ${monthLabel(payment.month)}${method}${payment.notes ? ` · ${payment.notes}` : ''}`,
        cashIn: duesAmount, cashOut: 0,
      })
      if (payment.extraAmount > 0) entries.push({
        id: `${payment.id}-other`, entityId: payment.id, entityType: 'payment-other',
        date: payment.paymentDate, source: 'Penerimaan',
        category: 'Penerimaan Lain-Lain', detail: payment.extraType || 'Lainnya',
        description: `${accountCode} · ${monthLabel(payment.month)}${method}${payment.notes ? ` · ${payment.notes}` : ''}`,
        cashIn: payment.extraAmount, cashOut: 0,
      })
    })

    data.openingArrearsPayments.filter((payment) => payment.paymentDate <= today).forEach((payment) => {
      const item = data.openingArrearsItems.find((arrears) => arrears.id === payment.openingArrearsItemId)
      entries.push({
        id: payment.id, entityId: payment.id, entityType: 'opening-arrears',
        date: payment.paymentDate, source: 'Penerimaan',
        category: 'Pelunasan Tunggakan s.d. 2025',
        detail: item?.debtorName ?? 'Debitur tidak ditemukan',
        description: `${item?.houseId ? accountCodeForHouse(item.houseId) : 'Rumah lama belum diketahui'}${payment.method ? ` · ${payment.method}` : ''}${payment.notes ? ` · ${payment.notes}` : ''}`,
        cashIn: payment.amount, cashOut: 0,
      })
    })

    data.expenses.filter((expense) => expense.date <= today).forEach((expense) => entries.push({
      id: expense.id, entityId: expense.id, entityType: 'expense',
      date: expense.date, source: 'Pengeluaran',
      category: legacyExpenseCategory[expense.category] ?? expense.category,
      detail: expense.detail || legacyExpenseDetail[expense.category] || expense.category,
      description: expense.description || '—', cashIn: 0, cashOut: expense.amount,
    }))

    data.receivableTransactions.filter((transaction) => transaction.date <= today).forEach((transaction) => entries.push({
      id: transaction.id, entityId: transaction.id, entityType: 'receivable',
      date: transaction.date, source: 'Piutang', category: 'Piutang',
      detail: transaction.transactionType === 'disbursement' ? 'Pemberian Piutang' : 'Penerimaan/Pelunasan Piutang',
      description: `${transaction.debtor}${transaction.description ? ` · ${transaction.description}` : ''}`,
      cashIn: transaction.transactionType === 'repayment' ? transaction.amount : 0,
      cashOut: transaction.transactionType === 'disbursement' ? transaction.amount : 0,
    }))

    entries.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id))
    let balance = data.openingCashBalance
    const rows: CashJournalEntry[] = entries.map((entry) => {
      balance += entry.cashIn - entry.cashOut
      return { ...entry, runningBalance: balance }
    })
    return {
      rows,
      totalCashIn: rows.reduce((sum, entry) => sum + entry.cashIn, 0),
      totalCashOut: rows.reduce((sum, entry) => sum + entry.cashOut, 0),
      closingBalance: rows.at(-1)?.runningBalance ?? data.openingCashBalance,
    }
  }, [accounts, data])
  const journalYears = useMemo(() => Array.from(new Set(cashJournal.rows.map((entry) => entry.date.slice(0, 4)))).sort(), [cashJournal.rows])
  const filteredJournalRows = useMemo(() => {
    const query = journalQuery.trim().toLowerCase()
    return cashJournal.rows
      .filter((entry) => journalYear === 'all' || entry.date.startsWith(`${journalYear}-`))
      .filter((entry) => journalMonth === 'all' || entry.date.slice(5, 7) === journalMonth)
      .filter((entry) => !query || `${entry.date} ${entry.source} ${entry.category} ${entry.detail} ${entry.description}`.toLowerCase().includes(query))
      .sort((a, b) => journalSort === 'asc'
        ? a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
        : b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [cashJournal.rows, journalMonth, journalQuery, journalSort, journalYear])

  const outstandingForPeriod = (account: BillingAccount, month: string) => {
    const due = monthlyFeeForAccount(account, data.houses, data.tariffs, data.jointFee0203, month)
    const paid = data.payments
      .filter((payment) => account.houseIds.includes(payment.houseId) && payment.month === month)
      .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
    return Math.max(due - paid, 0)
  }

  const updatePaymentPeriod = (index: number, month: string) => {
    const existingPayment = data.payments.find((payment) =>
      selected.houseIds.includes(payment.houseId) && payment.month === month && payment.mandatoryAmount > 0,
    )
    if (existingPayment) {
      setError(`Pembayaran iuran ${selected.code} untuk ${monthLabel(month)} sudah tercatat. Periode ini tidak dapat diinput kembali.`)
      return
    }
    setError('')
    const mandatory = String(outstandingForPeriod(selected, month))
    setPaymentForm((form) => ({
      ...form,
      periods: form.periods.map((period, periodIndex) => periodIndex === index ? { month, mandatory } : period),
    }))
  }

  const updatePaymentPeriodPart = (index: number, part: 'year' | 'month', value: string) => {
    const current = paymentForm.periods[index]?.month ?? activeMonth
    const [year, month] = current.split('-')
    updatePaymentPeriod(index, part === 'year' ? `${value}-${month}` : `${year}-${value}`)
  }

  const addPaymentPeriod = () => {
    const month = nextMonthValue(paymentForm.periods.at(-1)?.month ?? activeMonth)
    const existingPayment = data.payments.find((payment) =>
      selected.houseIds.includes(payment.houseId) && payment.month === month && payment.mandatoryAmount > 0,
    )
    if (existingPayment) {
      setError(`Pembayaran iuran ${selected.code} untuk ${monthLabel(month)} sudah tercatat. Pilih periode lain.`)
      return
    }
    setError('')
    setPaymentForm((form) => ({
      ...form,
      periods: [...form.periods, { month, mandatory: String(outstandingForPeriod(selected, month)) }],
    }))
  }

  const removePaymentPeriod = (index: number) => {
    setPaymentForm((form) => ({ ...form, periods: form.periods.filter((_, periodIndex) => periodIndex !== index) }))
  }

  const selectAccount = (account: BillingAccount) => {
    const statement = statements.find((item) => item.id === account.id) ?? selected
    setSelectedAccountId(account.id)
    setRecapYear(Math.min(2028, Math.max(2026, now.getFullYear())))
    setShowRecap(true)
    setPaymentForm((form) => ({
      ...form,
      periods: [{ month: activeMonth, mandatory: String(statement.currentBalance) }],
      arrears: String(statement.arrearsBalance),
      openingArrearsItemId: '',
    }))
  }

  const openPublicRecap = (account: BillingAccount) => {
    setSelectedAccountId(account.id)
    setRecapYear(Math.min(2028, Math.max(2026, now.getFullYear())))
    setShowRecap(true)
  }

  const selectOtherReceiptAccount = (account: BillingAccount) => {
    setSelectedAccountId(account.id)
    setPaymentForm((form) => ({ ...form, receiptKind: 'other' }))
  }

  const openPublicOtherFundDetail = (account: BillingAccount) => {
    setSelectedOtherFundAccountId(account.id)
    setShowOtherFundDetail(true)
  }

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3200) }

  const copyAccount = async () => {
    await navigator.clipboard.writeText(data.bankAccountNumber); setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!supabase) { setCanEdit(true); setMode('admin'); setShowLogin(false); return }
    const { error: authError } = await supabase.auth.signInWithPassword(loginForm)
    if (authError) { setError('Email atau kata sandi tidak sesuai.'); return }
    const isAdmin = await currentUserIsAdmin()
    if (!isAdmin) { await supabase.auth.signOut(); setError('Akun ini tidak memiliki akses admin.'); return }
    setCanEdit(true); setMode('admin'); setShowLogin(false); await loadData()
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setCanEdit(false); setMode('public'); flash('Anda telah keluar dari mode admin.')
  }

  const savePayment = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!paymentForm.paymentDate) { setError('Tanggal pembayaran wajib dipilih.'); return }
    let payments: Payment[]
    let successMessage: string
    if (paymentForm.receiptKind === 'other') {
      const extraAmount = Number(paymentForm.otherAmount)
      if (!paymentForm.otherPeriod) { setError('Periode penerimaan wajib dipilih.'); return }
      if (extraAmount <= 0) { setError('Nilai penerimaan lain-lain harus lebih dari nol.'); return }
      payments = [{
        id: crypto.randomUUID(), houseId: selected.houseIds[0], month: paymentForm.otherPeriod,
        paymentDate: paymentForm.paymentDate, mandatoryAmount: 0, arrearsAmount: 0,
        extraAmount, extraType: paymentForm.extraType,
        method: paymentForm.method, notes: paymentForm.notes, openingArrearsItemId: null,
      }]
      successMessage = `Penerimaan lain-lain ${selected.code} berhasil dicatat.`
    } else {
      const periodMonths = paymentForm.periods.map((period) => period.month)
      if (new Set(periodMonths).size !== periodMonths.length) { setError('Setiap periode pembayaran harus berbeda.'); return }
      const arrearsAmount = Number(paymentForm.arrears)
      const selectedArrearsItem = selectedOpeningArrearsItems.find((item) => item.id === paymentForm.openingArrearsItemId)
      if (arrearsAmount > 0 && selectedOpeningArrearsItems.length > 0 && !selectedArrearsItem) {
        setError('Pilih pihak yang tunggakannya sedang dilunasi.'); return
      }
      if (selectedArrearsItem && arrearsAmount > selectedArrearsItem.outstanding) {
        setError(`Pelunasan melebihi sisa tunggakan ${selectedArrearsItem.debtorName} sebesar ${rupiah.format(selectedArrearsItem.outstanding)}.`); return
      }
      const paidPeriods = paymentForm.periods
        .map((period) => ({ month: period.month, mandatoryAmount: Number(period.mandatory) }))
        .filter((period) => period.mandatoryAmount > 0)
      const duplicatePeriod = paidPeriods.find((period) => data.payments.some((payment) =>
        selected.houseIds.includes(payment.houseId) && payment.month === period.month && payment.mandatoryAmount > 0,
      ))
      if (duplicatePeriod) { setError(`Pembayaran iuran ${selected.code} untuk ${monthLabel(duplicatePeriod.month)} sudah tercatat dan tidak dapat diinput kembali.`); return }
      const recordedPeriods = paidPeriods.length ? paidPeriods : [{ month: paymentForm.periods[0].month, mandatoryAmount: 0 }]
      if (paidPeriods.reduce((sum, period) => sum + period.mandatoryAmount, 0) + arrearsAmount <= 0) { setError('Jumlah penerimaan iuran harus lebih dari nol.'); return }
      payments = recordedPeriods.map((period, index) => ({
        id: crypto.randomUUID(), houseId: selected.houseIds[0], month: period.month,
        paymentDate: paymentForm.paymentDate, mandatoryAmount: period.mandatoryAmount,
        arrearsAmount: index === 0 ? arrearsAmount : 0,
        extraAmount: 0, extraType: 'Tidak ada', method: paymentForm.method, notes: paymentForm.notes,
        openingArrearsItemId: index === 0 && arrearsAmount > 0 ? paymentForm.openingArrearsItemId || null : null,
      }))
      successMessage = `Penerimaan iuran ${selected.code} untuk ${payments.length} periode berhasil dicatat.`
    }
    try {
      if (supabaseConfigured) await createRemotePayments(payments)
      setData((current) => ({ ...current, payments: [...payments, ...current.payments] }))
      setPaymentForm((form) => ({
        receiptKind: form.receiptKind, paymentDate: today,
        periods: [{ month: activeMonth, mandatory: '0' }], arrears: '0', openingArrearsItemId: '',
        otherPeriod: activeMonth, otherAmount: '', extraType: 'Denda', method: 'Transfer', notes: '',
      }))
      flash(successMessage)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Penerimaan gagal disimpan.') }
  }

  const removePayment = async (payment: Payment) => {
    if (!window.confirm('Hapus catatan pembayaran ini?')) return
    try {
      if (supabaseConfigured) await deleteRemotePayment(payment.id)
      setData((current) => ({ ...current, payments: current.payments.filter((item) => item.id !== payment.id) }))
      flash('Catatan pembayaran dihapus.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pembayaran gagal dihapus.') }
  }

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const expense: Expense = { id: crypto.randomUUID(), date: expenseForm.date, category: expenseForm.category, detail: expenseForm.detail, amount: Number(expenseForm.amount), description: expenseForm.description }
    if (expense.amount <= 0) { setError('Jumlah pengeluaran harus lebih dari nol.'); return }
    try {
      if (supabaseConfigured) await createRemoteExpense(expense)
      setData((current) => ({ ...current, expenses: [expense, ...current.expenses] }))
      setExpenseForm({ date: today, category: 'Beban', detail: 'Beban Security', amount: '', description: '' }); flash('Pengeluaran berhasil dicatat.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pengeluaran gagal disimpan.') }
  }

  const removeExpense = async (expense: Expense) => {
    if (!window.confirm('Hapus catatan pengeluaran ini?')) return
    try {
      if (supabaseConfigured) await deleteRemoteExpense(expense.id)
      setData((current) => ({ ...current, expenses: current.expenses.filter((item) => item.id !== expense.id) }))
      flash('Catatan pengeluaran dihapus.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pengeluaran gagal dihapus.') }
  }

  const saveReceivableTransaction = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const transaction: ReceivableTransaction = {
      id: crypto.randomUUID(), date: receivableForm.date,
      transactionType: receivableForm.transactionType, debtor: receivableForm.debtor,
      amount: Number(receivableForm.amount), description: receivableForm.description,
    }
    if (transaction.amount <= 0) { setError('Jumlah transaksi piutang harus lebih dari nol.'); return }
    const currentBalance = receivableBalances.get(transaction.debtor) ?? 0
    if (transaction.transactionType === 'repayment' && transaction.amount > currentBalance) {
      setError(`Pelunasan melebihi saldo piutang ${transaction.debtor} sebesar ${rupiah.format(currentBalance)}.`); return
    }
    try {
      if (supabaseConfigured) await createRemoteReceivableTransaction(transaction)
      setData((current) => ({ ...current, receivableTransactions: [transaction, ...current.receivableTransactions] }))
      setReceivableForm((form) => ({ ...form, date: today, amount: '', description: '' }))
      flash(transaction.transactionType === 'disbursement' ? 'Pemberian piutang berhasil dicatat.' : 'Pelunasan piutang berhasil dicatat.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Transaksi piutang gagal disimpan.') }
  }

  const removeReceivableTransaction = async (transaction: ReceivableTransaction) => {
    if (!window.confirm('Hapus transaksi piutang ini?')) return
    const currentBalance = receivableBalances.get(transaction.debtor) ?? 0
    if (transaction.transactionType === 'disbursement' && currentBalance - transaction.amount < 0) {
      setError('Pemberian piutang ini tidak dapat dihapus karena sudah memiliki pelunasan terkait.'); return
    }
    try {
      if (supabaseConfigured) await deleteRemoteReceivableTransaction(transaction.id)
      setData((current) => ({ ...current, receivableTransactions: current.receivableTransactions.filter((item) => item.id !== transaction.id) }))
      flash('Transaksi piutang dihapus.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Transaksi piutang gagal dihapus.') }
  }

  const removeJournalEntry = async (entry: CashJournalEntry) => {
    if (entry.entityType === 'payment-dues' || entry.entityType === 'payment-other') {
      const payment = data.payments.find((item) => item.id === entry.entityId)
      if (payment) await removePayment(payment)
      return
    }
    if (entry.entityType === 'opening-arrears') {
      const payment = data.openingArrearsPayments.find((item) => item.id === entry.entityId)
      if (payment) await removeOpeningArrearsPayment(payment)
      return
    }
    if (entry.entityType === 'expense') {
      const expense = data.expenses.find((item) => item.id === entry.entityId)
      if (expense) await removeExpense(expense)
      return
    }
    const transaction = data.receivableTransactions.find((item) => item.id === entry.entityId)
    if (transaction) await removeReceivableTransaction(transaction)
  }

  const openJournalEdit = (entry: CashJournalEntry) => {
    setError('')
    const base: JournalEditForm = {
      entry, date: entry.date, month: activeMonth, mandatoryAmount: '0', arrearsAmount: '0',
      extraAmount: '0', extraType: 'Denda', method: 'Transfer', category: 'Beban',
      detail: 'Beban Security', amount: String(entry.cashIn || entry.cashOut), debtor: 'Pak Idris',
      transactionType: 'disbursement', notes: '',
    }
    if (entry.entityType === 'payment-dues' || entry.entityType === 'payment-other') {
      const payment = data.payments.find((item) => item.id === entry.entityId)
      if (!payment) return
      setJournalEdit({
        ...base, date: payment.paymentDate, month: payment.month,
        mandatoryAmount: String(payment.mandatoryAmount), arrearsAmount: String(payment.arrearsAmount),
        extraAmount: String(payment.extraAmount), extraType: payment.extraType,
        method: payment.method || 'Transfer', notes: payment.notes,
      })
      return
    }
    if (entry.entityType === 'opening-arrears') {
      const payment = data.openingArrearsPayments.find((item) => item.id === entry.entityId)
      if (!payment) return
      setJournalEdit({ ...base, date: payment.paymentDate, amount: String(payment.amount), method: payment.method || 'Transfer', notes: payment.notes })
      return
    }
    if (entry.entityType === 'expense') {
      const expense = data.expenses.find((item) => item.id === entry.entityId)
      if (!expense) return
      const category = legacyExpenseCategory[expense.category] ?? expense.category
      setJournalEdit({ ...base, date: expense.date, category, detail: expense.detail || legacyExpenseDetail[expense.category] || category, amount: String(expense.amount), notes: expense.description })
      return
    }
    const transaction = data.receivableTransactions.find((item) => item.id === entry.entityId)
    if (!transaction) return
    setJournalEdit({ ...base, date: transaction.date, amount: String(transaction.amount), debtor: transaction.debtor, transactionType: transaction.transactionType, notes: transaction.description })
  }

  const saveJournalEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!journalEdit) return
    setError('')
    try {
      if (journalEdit.entry.entityType === 'payment-dues' || journalEdit.entry.entityType === 'payment-other') {
        const original = data.payments.find((item) => item.id === journalEdit.entry.entityId)
        if (!original) throw new Error('Catatan penerimaan tidak ditemukan.')
        const next: Payment = {
          ...original, paymentDate: journalEdit.date, month: journalEdit.month,
          method: journalEdit.method, notes: journalEdit.notes,
          mandatoryAmount: journalEdit.entry.entityType === 'payment-dues' ? Number(journalEdit.mandatoryAmount) : original.mandatoryAmount,
          arrearsAmount: journalEdit.entry.entityType === 'payment-dues' ? Number(journalEdit.arrearsAmount) : original.arrearsAmount,
          extraAmount: journalEdit.entry.entityType === 'payment-other' ? Number(journalEdit.extraAmount) : original.extraAmount,
          extraType: journalEdit.entry.entityType === 'payment-other' ? journalEdit.extraType : original.extraType,
        }
        const editedAmount = journalEdit.entry.entityType === 'payment-dues' ? next.mandatoryAmount + next.arrearsAmount : next.extraAmount
        if (editedAmount <= 0) throw new Error('Nilai penerimaan harus lebih dari nol.')
        if (supabaseConfigured) await updateRemotePayment(next)
        setData((current) => ({ ...current, payments: current.payments.map((item) => item.id === next.id ? next : item) }))
      } else if (journalEdit.entry.entityType === 'opening-arrears') {
        const original = data.openingArrearsPayments.find((item) => item.id === journalEdit.entry.entityId)
        if (!original) throw new Error('Pembayaran tunggakan tidak ditemukan.')
        const amount = Number(journalEdit.amount)
        const balance = openingArrearsBalances.find((item) => item.id === original.openingArrearsItemId)
        const available = (balance?.outstanding ?? 0) + original.amount
        if (amount <= 0) throw new Error('Nilai pembayaran tunggakan harus lebih dari nol.')
        if (amount > available) throw new Error(`Pembayaran melebihi saldo tersedia sebesar ${rupiah.format(available)}.`)
        const next: OpeningArrearsPayment = { ...original, paymentDate: journalEdit.date, amount, method: journalEdit.method, notes: journalEdit.notes }
        if (supabaseConfigured) await updateRemoteOpeningArrearsPayment(next)
        setData((current) => ({ ...current, openingArrearsPayments: current.openingArrearsPayments.map((item) => item.id === next.id ? next : item) }))
      } else if (journalEdit.entry.entityType === 'expense') {
        const amount = Number(journalEdit.amount)
        if (amount <= 0) throw new Error('Nilai pengeluaran harus lebih dari nol.')
        const next: Expense = { id: journalEdit.entry.entityId, date: journalEdit.date, category: journalEdit.category, detail: journalEdit.detail, amount, description: journalEdit.notes }
        if (supabaseConfigured) await updateRemoteExpense(next)
        setData((current) => ({ ...current, expenses: current.expenses.map((item) => item.id === next.id ? next : item) }))
      } else {
        const original = data.receivableTransactions.find((item) => item.id === journalEdit.entry.entityId)
        if (!original) throw new Error('Catatan piutang tidak ditemukan.')
        const amount = Number(journalEdit.amount)
        if (amount <= 0) throw new Error('Nilai transaksi piutang harus lebih dari nol.')
        const originalMovement = original.transactionType === 'disbursement' ? original.amount : -original.amount
        const originalBalanceAfterRemoval = (receivableBalances.get(original.debtor) ?? 0) - originalMovement
        if (journalEdit.debtor !== original.debtor && originalBalanceAfterRemoval < 0) throw new Error('Pemberian piutang ini tidak dapat dipindahkan karena sudah memiliki pelunasan terkait.')
        const targetBalanceBeforeEdit = journalEdit.debtor === original.debtor ? originalBalanceAfterRemoval : (receivableBalances.get(journalEdit.debtor) ?? 0)
        const nextMovement = journalEdit.transactionType === 'disbursement' ? amount : -amount
        if (targetBalanceBeforeEdit + nextMovement < 0) throw new Error(`Nilai penerimaan pelunasan melebihi saldo piutang tersedia sebesar ${rupiah.format(Math.max(targetBalanceBeforeEdit, 0))}.`)
        const next: ReceivableTransaction = { id: original.id, date: journalEdit.date, transactionType: journalEdit.transactionType, debtor: journalEdit.debtor, amount, description: journalEdit.notes }
        if (supabaseConfigured) await updateRemoteReceivableTransaction(next)
        setData((current) => ({ ...current, receivableTransactions: current.receivableTransactions.map((item) => item.id === next.id ? next : item) }))
      }
      setJournalEdit(null)
      flash('Catatan jurnal berhasil diperbarui dan saldo berjalan telah dihitung ulang.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Catatan jurnal gagal diperbarui.') }
  }

  const patchHouse = (id: number, patch: Partial<House>) => setData((current) => ({ ...current, houses: current.houses.map((house) => house.id === id ? { ...house, ...patch } : house) }))
  const persistHouse = async (house: House) => {
    try {
      if (supabaseConfigured) { await updateRemoteHouse(house, today); await loadData() }
      flash(`${house.number} diperbarui. Riwayat penghuni telah disesuaikan.`)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Data rumah gagal disimpan.') }
  }

  const saveOpeningArrears = async (account: BillingAccount) => {
    try {
      const draft = openingArrearsDrafts[account.id]
      const value = draft === undefined || draft === '' ? 0 : Number(draft)
      if (!Number.isFinite(value) || value < 0) throw new Error('Nilai tunggakan awal tidak valid.')
      if (supabaseConfigured) {
        await setRemoteOpeningArrearsTotal(account.houseIds, value)
        await loadData()
      } else {
        setData((current) => ({
          ...current,
          houses: current.houses.map((house) => account.houseIds.includes(house.id)
            ? { ...house, openingArrears: house.id === account.houseIds[0] ? value : 0 }
            : house),
        }))
      }
      setOpeningArrearsDrafts((current) => { const next = { ...current }; delete next[account.id]; return next })
      flash(`Tagihan lama ${account.code} berhasil disimpan.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tagihan lama gagal disimpan.')
    }
  }

  const saveOpeningArrearsItem = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const amount = Number(arrearsForm.originalAmount)
    if (!arrearsForm.debtorName.trim()) { setError('Nama pihak yang berutang wajib diisi.'); return }
    if (amount <= 0) { setError('Nilai tunggakan harus lebih dari nol.'); return }
    const item: OpeningArrearsItem = {
      id: crypto.randomUUID(), houseId: arrearsForm.houseId ? Number(arrearsForm.houseId) : null,
      occupancyId: null, debtorName: arrearsForm.debtorName.trim(), debtorRole: arrearsForm.debtorRole,
      cutoffDate: arrearsForm.cutoffDate, originalAmount: amount, notes: arrearsForm.notes.trim(),
    }
    try {
      if (supabaseConfigured) { await createRemoteOpeningArrearsItem(item); await loadData() }
      else setData((current) => ({ ...current, openingArrearsItems: [item, ...current.openingArrearsItems] }))
      setArrearsForm({ houseId: '', debtorName: '', debtorRole: 'former_tenant', cutoffDate: '2025-12-31', originalAmount: '', notes: '' })
      flash(`Tunggakan ${item.debtorName} berhasil dicatat.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Rincian tunggakan gagal disimpan.') }
  }

  const removeOpeningArrearsItem = async (item: OpeningArrearsItem) => {
    if (!window.confirm(`Hapus rincian tunggakan ${item.debtorName}?`)) return
    try {
      if (supabaseConfigured) { await deleteRemoteOpeningArrearsItem(item.id); await loadData() }
      else setData((current) => ({ ...current, openingArrearsItems: current.openingArrearsItems.filter((row) => row.id !== item.id) }))
      flash('Rincian tunggakan dihapus.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Rincian tunggakan gagal dihapus.') }
  }

  const saveOpeningArrearsPayment = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const item = openingArrearsBalances.find((row) => row.id === arrearsPaymentForm.openingArrearsItemId)
    const amount = Number(arrearsPaymentForm.amount)
    if (!item) { setError('Pilih debitur tunggakan yang melakukan pembayaran.'); return }
    if (amount <= 0) { setError('Nilai pembayaran harus lebih dari nol.'); return }
    if (amount > item.outstanding) { setError(`Pembayaran melebihi saldo outstanding ${item.debtorName} sebesar ${rupiah.format(item.outstanding)}.`); return }
    const payment: OpeningArrearsPayment = {
      id: crypto.randomUUID(), openingArrearsItemId: item.id,
      paymentDate: arrearsPaymentForm.paymentDate, amount,
      method: arrearsPaymentForm.method, notes: arrearsPaymentForm.notes.trim(),
    }
    try {
      if (supabaseConfigured) await createRemoteOpeningArrearsPayment(payment)
      setData((current) => ({ ...current, openingArrearsPayments: [payment, ...current.openingArrearsPayments] }))
      setArrearsPaymentForm((form) => ({ ...form, amount: '', notes: '' }))
      flash(`Pembayaran tunggakan ${item.debtorName} berhasil dicatat.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pembayaran tunggakan gagal disimpan.') }
  }

  const removeOpeningArrearsPayment = async (payment: OpeningArrearsPayment) => {
    if (!window.confirm('Hapus pembayaran tunggakan ini? Saldo outstanding dan kas akan dihitung ulang.')) return
    try {
      if (supabaseConfigured) await deleteRemoteOpeningArrearsPayment(payment.id)
      setData((current) => ({ ...current, openingArrearsPayments: current.openingArrearsPayments.filter((row) => row.id !== payment.id) }))
      flash('Pembayaran tunggakan dihapus dan saldo dihitung ulang.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pembayaran tunggakan gagal dihapus.') }
  }

  const saveOccupancy = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!occupancyForm.occupantName.trim()) { setError('Nama penghuni wajib diisi.'); return }
    if (occupancyForm.endDate < occupancyForm.startDate) { setError('Tanggal selesai tidak boleh mendahului tanggal mulai.'); return }
    const occupancy: HouseOccupancy = {
      id: crypto.randomUUID(), houseId: Number(occupancyForm.houseId), occupantName: occupancyForm.occupantName.trim(),
      occupantRole: occupancyForm.occupantRole, startDate: occupancyForm.startDate,
      endDate: occupancyForm.endDate, notes: occupancyForm.notes.trim(),
    }
    try {
      if (supabaseConfigured) { await createRemoteOccupancy(occupancy); await loadData() }
      else setData((current) => ({ ...current, houseOccupancies: [occupancy, ...current.houseOccupancies] }))
      setOccupancyForm((form) => ({ ...form, occupantName: '', notes: '' }))
      flash(`Riwayat ${occupancy.occupantName} berhasil dicatat.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Riwayat penghuni gagal disimpan.') }
  }

  const removeOccupancy = async (occupancy: HouseOccupancy) => {
    if (!occupancy.endDate) { setError('Penghuni aktif tidak dapat dihapus dari riwayat. Ubah data rumah untuk menggantinya.'); return }
    if (!window.confirm(`Hapus riwayat penghuni ${occupancy.occupantName}?`)) return
    try {
      if (supabaseConfigured) await deleteRemoteOccupancy(occupancy.id)
      setData((current) => ({ ...current, houseOccupancies: current.houseOccupancies.filter((row) => row.id !== occupancy.id) }))
      flash('Riwayat penghuni dihapus.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Riwayat penghuni gagal dihapus.') }
  }

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault()
    const next = {
      openingCashBalance: Number(settingsForm.openingCashBalance), jointFee0203: Number(settingsForm.jointFee0203),
      bankName: settingsForm.bankName, bankAccountNumber: settingsForm.bankAccountNumber, bankAccountHolder: settingsForm.bankAccountHolder,
    }
    try {
      if (supabaseConfigured) await updateRemoteSettings({
        opening_cash_balance: next.openingCashBalance, joint_fee_02_03: next.jointFee0203,
        bank_name: next.bankName, bank_account_number: next.bankAccountNumber, bank_account_holder: next.bankAccountHolder,
      })
      setData((current) => ({ ...current, ...next })); flash('Pengaturan berhasil disimpan.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pengaturan gagal disimpan.') }
  }

  const saveTariff = async (event: FormEvent) => {
    event.preventDefault()
    const tariff: Tariff = { id: crypto.randomUUID(), effectiveDate: tariffForm.effectiveDate, occupiedFee: Number(tariffForm.occupiedFee), emptyFee: Number(tariffForm.emptyFee), notes: tariffForm.notes }
    try {
      if (supabaseConfigured) await createRemoteTariff(tariff)
      setData((current) => ({ ...current, tariffs: [...current.tariffs, tariff].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)) }))
      setTariffForm((form) => ({ ...form, notes: '' })); flash('Tarif baru berhasil ditambahkan.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Tarif gagal disimpan.') }
  }

  const selectedPayments = data.payments.filter((payment) => selected?.houseIds.includes(payment.houseId)).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  const selectedDuesPayments = selectedPayments.filter((payment) => payment.mandatoryAmount + payment.arrearsAmount > 0)
  const paymentPeriodTotal = paymentForm.periods.reduce((sum, period) => sum + Number(period.mandatory || 0), 0)

  if (loading) return <main className="loading-screen"><div className="brand-mark">CSJ</div><p>Menyiapkan laporan kas warga…</p></main>

  return <main className="app-shell">
    <header className="site-header">
      <div className="brand"><div className="brand-mark">CSJ</div><div><span>Transparansi kas warga</span><h1>Monitoring Iuran Warga CSJ</h1></div></div>
      <div className="header-actions">
        {canEdit ? <button className="admin-button" onClick={() => setMode(mode === 'admin' ? 'public' : 'admin')} type="button"><ShieldCheck size={18} />{mode === 'admin' ? 'Lihat halaman warga' : 'Buka admin'}</button> : <button className="admin-button" onClick={() => setShowLogin(true)} type="button"><LogIn size={18} />Login Admin</button>}
      </div>
    </header>

    {notice && <div className="notice"><CheckCircle2 size={18} />{notice}</div>}
    {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Tutup"><X size={17} /></button></div>}

    {mode === 'public' ? <>
      <nav className="public-nav" aria-label="Navigasi warga">
        <button className={publicView === 'overview' ? 'active' : ''} onClick={() => setPublicView('overview')}><Home size={18} />Ringkasan</button>
        <button className={publicView === 'dues' ? 'active' : ''} onClick={() => setPublicView('dues')}><ReceiptText size={18} />Status Iuran Wajib</button>
        <button className={publicView === 'other-funds' ? 'active' : ''} onClick={() => setPublicView('other-funds')}><PiggyBank size={18} />Penerimaan Lain-Lain</button>
        <button className={publicView === 'expenses' ? 'active' : ''} onClick={() => setPublicView('expenses')}><WalletCards size={18} />Laporan Posisi Keuangan</button>
        <button className={publicView === 'opening-arrears' ? 'active' : ''} onClick={() => setPublicView('opening-arrears')}><CircleAlert size={18} />Tunggakan s.d. 31 Des 2025</button>
      </nav>

      {publicView === 'overview' && <div className="page-stack">
        <section className="welcome-panel">
          <div><span className="section-kicker">Laporan {monthLabel(activeMonth)}</span><h2>Kas warga, terbuka untuk semua.</h2><p>Lihat pembayaran iuran, tunggakan, serta penggunaan dana lingkungan CSJ dalam satu halaman.</p></div>
          <div className="cash-highlight"><span>Saldo kas saat ini</span><strong>{rupiah.format(cash.cashBalance)}</strong><small>Saldo awal + seluruh pemasukan − seluruh pengeluaran</small></div>
        </section>
        <section className="money-grid">
          <article><div className="metric-icon income"><Banknote size={21} /></div><span>Pemasukan bulan ini</span><strong>{rupiah.format(cash.monthIncome)}</strong></article>
          <article><div className="metric-icon expense"><WalletCards size={21} /></div><span>Pengeluaran bulan ini</span><strong>{rupiah.format(cash.monthExpenses)}</strong></article>
          <article><div className="metric-icon target"><Users size={21} /></div><span>Target iuran</span><strong>{rupiah.format(expected)}</strong></article>
          <article><div className="metric-icon warning"><CircleAlert size={21} /></div><span>Belum lunas</span><strong>{unpaid} akun</strong></article>
        </section>
        <section className="overview-grid">
          <article className="bank-card">
            <div className="bank-heading"><div className="bank-icon"><CreditCard size={25} /></div><div><span>Informasi pembayaran</span><h3>{data.bankName}</h3></div></div>
            <div className="account-number"><span>Nomor rekening</span><strong>{data.bankAccountNumber}</strong><small>a.n. {data.bankAccountHolder}</small></div>
            <button onClick={() => void copyAccount()} type="button">{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Nomor tersalin' : 'Salin nomor rekening'}</button>
          </article>
          <article className="progress-card">
            <div className="panel-title"><div><span>Progres bulan ini</span><h3>{monthLabel(activeMonth)}</h3></div><strong>{expected ? Math.round(collected / expected * 100) : 0}%</strong></div>
            <div className="progress-track"><span style={{ width: `${Math.min(expected ? collected / expected * 100 : 0, 100)}%` }} /></div>
            <dl><div><dt>Terkumpul</dt><dd>{rupiah.format(collected)}</dd></div><div><dt>Tunggakan lama</dt><dd>{rupiah.format(totalArrears)}</dd></div></dl>
          </article>
        </section>
        <section className="panel status-preview">
          <div className="panel-title"><div><span>Status pembayaran iuran wajib</span><h3>Pilih akun rumah</h3></div><button className="text-button" onClick={() => setPublicView('dues')}>Lihat lengkap →</button></div>
          <StatusGrid accounts={statements} selectedId={selected.id} onSelect={openPublicRecap} />
          <div className="selected-summary"><div><span>{selected.code}</span><h3>{selected.residentName}</h3><small>{selected.houseIds.length === 2 ? 'Satu akun gabungan untuk dua rumah' : residenceLabel[selected.residenceStatus]}</small></div><dl><div><dt>Tagihan bulan ini</dt><dd>{rupiah.format(selected.monthlyDue)}</dd></div><div><dt>Sudah dibayar</dt><dd>{rupiah.format(selected.paidThisPeriod)}</dd></div><div><dt>Total belum dibayar</dt><dd>{rupiah.format(selected.totalOutstanding)}</dd></div></dl><span className={`status-badge ${selected.isPaid ? 'paid' : 'due'}`}>{selected.isPaid ? 'Lunas' : 'Belum lunas'}</span></div>
        </section>
      </div>}

      {publicView === 'dues' && <section className="panel page-panel">
          <div className="panel-title"><div><span>Status {monthLabel(activeMonth)}</span><h2>Status Pembayaran Iuran Wajib</h2><p>CSJ02 dan CSJ03 tercatat sebagai satu akun pembayaran.</p></div><div className="legend"><span><i className="dot paid" />Lunas</span><span><i className="dot due" />Belum lunas</span></div></div>
          <StatusGrid accounts={statements} selectedId={selected.id} onSelect={openPublicRecap} />
          <div className="selected-summary large"><div><span>{selected.code}</span><h3>{selected.residentName}</h3><small>{selected.houseIds.length === 2 ? 'Akun pembayaran gabungan' : residenceLabel[selected.residenceStatus]}</small></div><dl><div><dt>Tagihan periode</dt><dd>{rupiah.format(selected.monthlyDue)}</dd></div><div><dt>Terbayar periode</dt><dd>{rupiah.format(selected.paidThisPeriod)}</dd></div><div><dt>Tunggakan sebelumnya</dt><dd>{rupiah.format(selected.arrearsBalance)}</dd></div><div><dt>Total kewajiban</dt><dd>{rupiah.format(selected.totalOutstanding)}</dd></div></dl><span className={`status-badge ${selected.isPaid ? 'paid' : 'due'}`}>{selected.isPaid ? 'Lunas' : 'Belum lunas'}</span></div>
          <div className="table-wrap"><table><thead><tr><th>Akun</th><th>Nama</th><th>Tagihan</th><th>Terbayar</th><th>Tunggakan</th><th>Status</th></tr></thead><tbody>{statements.map((item) => <tr key={item.id}><td><strong>{item.code}</strong></td><td>{item.residentName}</td><td>{rupiah.format(item.monthlyDue)}</td><td>{rupiah.format(item.paidThisPeriod)}</td><td>{rupiah.format(item.arrearsBalance)}</td><td><span className={`mini-status ${item.isPaid ? 'paid' : 'due'}`}>{item.isPaid ? 'Lunas' : 'Belum'}</span></td></tr>)}</tbody></table></div>
      </section>}

      {publicView === 'other-funds' && <div className="page-stack">
        <section className="panel other-funds-panel">
          <div className="panel-title"><div><span>Dana titipan warga</span><h2>Penerimaan Lain-Lain per Rumah</h2><p>Saldo per akun sampai {pageOpenedLabel}. Klik rumah untuk melihat rincian pembayarannya. Denda tidak termasuk dalam saldo.</p></div><div className="other-funds-total"><span>Total saldo dana</span><strong>{rupiah.format(otherFunds.total)}</strong></div></div>
          <div className="other-fund-summary">{otherFunds.categories.map((item) => <article className="other-fund-card" key={item.category}><div className="fund-icon"><PiggyBank size={20} /></div><span>{item.category}</span><strong>{rupiah.format(item.balance)}</strong></article>)}</div>
        </section>
        <section className="panel other-fund-houses-panel"><div className="panel-title"><div><span>35 akun warga</span><h3>Saldo per Rumah</h3><p>Pilih akun untuk membuka detail penerimaan per jenis dan periode.</p></div></div><OtherFundAccountGrid rows={otherFunds.accounts} selectedId={selectedOtherFundAccountId} onSelect={openPublicOtherFundDetail} /></section>
      </div>}

      {publicView === 'expenses' && <div className="page-stack financial-page">
        <section className="financial-position-card"><div><span>Laporan tahunan</span><h2>Laporan Posisi Keuangan</h2><p>Penerimaan dan pengeluaran tahun {reportYear}; saldo kas dan piutang sampai {financialReport.reportEnd === today ? pageOpenedLabel : `31 Desember ${reportYear}`}.</p><div className="report-period-control"><label>Tahun laporan<select value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))}>{availableReportYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><button type="button" onClick={() => setMaxReportYear((year) => year + 1)}><Plus size={15} />Tambah {availableReportYears.at(-1)! + 1}</button></div></div><div><span>Posisi kas</span><strong>{rupiah.format(financialReport.netPosition)}</strong></div></section>
        <div className="financial-columns">
          <section className="panel financial-column income-column">
            <div className="financial-column-heading"><div><span>PENERIMAAN {reportYear}</span><h3>Penerimaan Kas</h3></div><strong>{rupiah.format(financialReport.totalIncome)}</strong></div>
            <details className="financial-detail"><summary><span>Penerimaan Iuran Warga</span><strong>{rupiah.format(financialReport.duesIncome)}</strong></summary><div className="financial-breakdown"><div><span>Iuran bulanan</span><strong>{rupiah.format(financialReport.mandatoryIncome)}</strong></div><div><span>Pelunasan tunggakan</span><strong>{rupiah.format(financialReport.arrearsIncome)}</strong></div></div></details>
            <details className="financial-detail"><summary><span>Penerimaan Lain-Lain</span><strong>{rupiah.format(financialReport.otherIncome)}</strong></summary><div className="financial-breakdown">{financialReport.otherBreakdown.length ? financialReport.otherBreakdown.map(([label, amount]) => <div key={label}><span>{label}</span><strong>{rupiah.format(amount)}</strong></div>) : <p>Belum ada penerimaan lain-lain.</p>}</div></details>
          </section>
          <section className="panel financial-column expense-column">
            <div className="financial-column-heading"><div><span>PENGELUARAN {reportYear}</span><h3>Pengeluaran Kas</h3></div><strong>{rupiah.format(financialReport.totalExpenses)}</strong></div>
            {financialReport.expenseGroups.map((group) => <details className="financial-detail" key={group.category}><summary><span>{group.category}</span><strong>{rupiah.format(group.total)}</strong></summary><div className="financial-breakdown">{group.details.length ? group.details.map(([label, amount]) => <div key={label}><span>{label}</span><strong>{rupiah.format(amount)}</strong></div>) : <p>Belum ada transaksi {group.category.toLowerCase()}.</p>}</div></details>)}
          </section>
          <section className="panel financial-column receivable-column">
            <div className="financial-column-heading"><div><span>SALDO ASET</span><h3>Piutang</h3></div><strong>{rupiah.format(financialReport.receivableBalance)}</strong></div>
            <div className="receivable-movement"><div><span>Pemberian {reportYear}</span><strong>{rupiah.format(financialReport.periodDisbursements)}</strong></div><div><span>Penerimaan/Pelunasan {reportYear}</span><strong>{rupiah.format(financialReport.periodRepayments)}</strong></div></div>
            {financialReport.receivableBreakdown.length ? financialReport.receivableBreakdown.map((item) => <details className="financial-detail" key={item.debtor}><summary><span>{item.debtor}</span><strong>{rupiah.format(item.balance)}</strong></summary><div className="financial-breakdown"><div><span>Total pemberian</span><strong>{rupiah.format(item.disbursed)}</strong></div><div><span>Total pelunasan</span><strong>{rupiah.format(item.repaid)}</strong></div><div><span>Saldo piutang</span><strong>{rupiah.format(item.balance)}</strong></div></div></details>) : <div className="empty-state">Belum ada saldo piutang.</div>}
          </section>
        </div>
      </div>}

      {publicView === 'opening-arrears' && <div className="page-stack opening-arrears-public-page">
        <section className="arrears-public-hero">
          <div><span>Posisi historis</span><h2>Tunggakan Outstanding s.d. 31 Desember 2025</h2><p>Rincian kewajiban lama berdasarkan pihak yang bertanggung jawab. Pembayaran tunggakan akan langsung mengurangi saldo outstanding debitur terkait.</p></div>
          <div><span>Total outstanding</span><strong>{rupiah.format(totalTrackedOpeningArrears)}</strong><small>{outstandingOpeningArrearsCount} pihak masih memiliki saldo</small></div>
        </section>
        <section className="arrears-public-summary">
          <article><span>Nilai awal tercatat</span><strong>{rupiah.format(originalTrackedOpeningArrears)}</strong></article>
          <article><span>Sudah dibayar</span><strong>{rupiah.format(settledTrackedOpeningArrears)}</strong></article>
          <article className="outstanding"><span>Sisa outstanding</span><strong>{rupiah.format(totalTrackedOpeningArrears)}</strong></article>
        </section>
        <section className="panel arrears-public-panel">
          <div className="panel-title"><div><span>Daftar debitur</span><h3>Rincian Tunggakan Lama</h3><p>Urutan berdasarkan nilai outstanding terbesar. Nomor rumah lama ditampilkan jika sudah diketahui.</p></div></div>
          <div className="table-wrap"><table className="public-arrears-table"><thead><tr><th>Rumah</th><th>Nama yang bertanggung jawab</th><th>Status pihak</th><th>Status pembayaran</th><th>Nilai awal</th><th>Sudah dibayar</th><th>Outstanding</th></tr></thead><tbody>{publicOpeningArrears.length ? publicOpeningArrears.map((item) => <tr key={item.id}><td>{item.houseId ? <strong>{data.houses.find((house) => house.id === item.houseId)?.number ?? `CSJ ${item.houseId}`}</strong> : <span className="unlinked-label">Rumah lama belum diketahui</span>}</td><td><strong>{item.debtorName}</strong></td><td>{arrearsDebtorRoleLabel[item.debtorRole]}</td><td><span className={`mini-status ${item.outstanding === 0 ? 'paid' : 'due'}`}>{item.outstanding === 0 ? 'Lunas' : item.settled > 0 ? 'Dibayar sebagian' : 'Belum bayar'}</span></td><td>{rupiah.format(item.originalAmount)}</td><td>{item.settled > 0 ? rupiah.format(item.settled) : '—'}</td><td><strong className={item.outstanding > 0 ? 'outstanding-amount' : ''}>{rupiah.format(item.outstanding)}</strong></td></tr>) : <tr><td colSpan={7}><div className="empty-state">Tidak ada data tunggakan sampai 31 Desember 2025.</div></td></tr>}</tbody><tfoot><tr><td colSpan={4}>Total</td><td>{rupiah.format(originalTrackedOpeningArrears)}</td><td>{rupiah.format(settledTrackedOpeningArrears)}</td><td><strong>{rupiah.format(totalTrackedOpeningArrears)}</strong></td></tr></tfoot></table></div>
        </section>
        <section className="panel arrears-movement-panel"><div className="panel-title"><div><span>Pergerakan saldo</span><h3>Mutasi Pembayaran per Debitur</h3><p>Buka nama debitur untuk melihat tanggal pembayaran dan saldo outstanding setelah setiap transaksi.</p></div></div><div className="arrears-movement-list">{publicOpeningArrears.map((item) => {
          const movements = arrearsMovementsFor(item.id)
          let running = item.originalAmount
          return <details className="arrears-movement-detail" key={item.id}><summary><span><strong>{item.debtorName}</strong><small>{item.houseId ? data.houses.find((house) => house.id === item.houseId)?.number ?? `CSJ ${item.houseId}` : 'Rumah lama belum diketahui'}</small></span><span className={`mini-status ${item.outstanding === 0 ? 'paid' : 'due'}`}>{item.outstanding === 0 ? 'Lunas' : item.settled > 0 ? 'Sebagian' : 'Belum bayar'}</span><strong>{rupiah.format(item.outstanding)}</strong></summary><div className="table-wrap"><table className="arrears-movement-table"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Pembayaran</th><th>Saldo</th></tr></thead><tbody><tr><td>31 Des 2025</td><td>Saldo awal tunggakan</td><td>—</td><td><strong>{rupiah.format(item.originalAmount)}</strong></td></tr>{movements.map((movement) => { running = Math.max(running - movement.amount, 0); return <tr key={movement.id}><td>{movement.date}</td><td>{movement.method || 'Pembayaran'}{movement.notes ? ` · ${movement.notes}` : ''}</td><td className="amount-in">{rupiah.format(movement.amount)}</td><td><strong>{rupiah.format(running)}</strong></td></tr> })}</tbody></table></div></details>
        })}</div></section>
      </div>}
    </> : <section className="admin-layout">
      <aside className="admin-sidebar"><div><span className="section-kicker">Area pengurus</span><h2>Administrasi CSJ</h2><p>Kelola data kas dengan akses terbatas.</p></div><nav>
        <button className={adminView === 'houses' ? 'active' : ''} onClick={() => setAdminView('houses')}><Building2 size={18} />Data Rumah</button>
        <button className={adminView === 'payments' ? 'active' : ''} onClick={() => { setAdminView('payments'); setPaymentForm((form) => ({ ...form, receiptKind: 'dues' })) }}><ReceiptText size={18} />Penerimaan Iuran Wajib</button>
        <button className={adminView === 'other-funds' ? 'active' : ''} onClick={() => { setAdminView('other-funds'); setPaymentForm((form) => ({ ...form, receiptKind: 'other' })) }}><PiggyBank size={18} />Penerimaan Lain-Lain</button>
        <button className={adminView === 'expenses' ? 'active' : ''} onClick={() => setAdminView('expenses')}><WalletCards size={18} />Pengeluaran</button>
        <button className={adminView === 'receivables' ? 'active' : ''} onClick={() => setAdminView('receivables')}><TrendingUp size={18} />Piutang</button>
        <button className={adminView === 'journal' ? 'active' : ''} onClick={() => setAdminView('journal')}><BookOpen size={18} />Jurnal Kas</button>
        <button className={adminView === 'opening-arrears' ? 'active' : ''} onClick={() => setAdminView('opening-arrears')}><CircleAlert size={18} />Tunggakan s.d. 2025</button>
        <button className={adminView === 'settings' ? 'active' : ''} onClick={() => setAdminView('settings')}><Settings2 size={18} />Pengaturan</button>
      </nav><div className="sidebar-actions"><button onClick={() => setMode('public')}><ArrowLeft size={17} />Halaman warga</button><button onClick={() => void signOut()}><LogOut size={17} />Keluar admin</button></div></aside>
      <div className="admin-content">
        {adminView === 'payments' && <>
          <div className="admin-heading"><div><span>Pencatatan penerimaan</span><h2>Penerimaan Iuran Wajib</h2><p>Periode berjalan otomatis {monthLabel(activeMonth)}. Pilih akun, periksa kewajiban, lalu catat penerimaan iurannya.</p></div></div>
          <div className="admin-two-column"><section className="panel account-picker"><div className="panel-title"><div><span>35 akun pembayar iuran</span><h3>Pilih akun</h3></div></div><StatusGrid accounts={statements} selectedId={selected.id} onSelect={selectAccount} /></section>
          <section className="panel form-card"><div className="selected-admin"><div className="house-avatar"><Home size={22} /></div><div><span>Akun terpilih</span><h3>{selected.code}</h3><p>{selected.residentName}</p></div><span className={`status-badge ${selected.isPaid ? 'paid' : 'due'}`}>{selected.isPaid ? 'Lunas' : 'Belum'}</span></div>
            <div className="obligation-strip"><div><span>Tagihan berjalan</span><strong>{rupiah.format(selected.currentBalance)}</strong></div><div><span>Tunggakan</span><strong>{rupiah.format(selected.arrearsBalance)}</strong></div></div>
            <form className="form-grid" onSubmit={savePayment}>
              <label>Tanggal penerimaan<input type="date" required value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} /></label>
              <label>Metode<select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select></label>
              <div className="payment-periods wide">
                <div className="payment-period-heading"><div><strong>Periode pembayaran</strong><span>Pilih bulan dan tahun. Tambahkan baris jika satu transaksi membayar beberapa bulan.</span></div><button className="secondary-action" type="button" onClick={addPaymentPeriod}><Plus size={16} />Tambah periode</button></div>
                {paymentForm.periods.map((period, index) => <div className="payment-period-row" key={`${index}-${period.month}`}>
                  <div className="payment-period-date"><label>Bulan<select value={period.month.slice(5, 7)} onChange={(event) => updatePaymentPeriodPart(index, 'month', event.target.value)}>{paymentMonths.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</select></label><label>Tahun<select value={period.month.slice(0, 4)} onChange={(event) => updatePaymentPeriodPart(index, 'year', event.target.value)}>{paymentYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div>
                  <label>Iuran periode<input type="number" min="0" step="1000" value={period.mandatory} onChange={(event) => setPaymentForm((form) => ({ ...form, periods: form.periods.map((item, periodIndex) => periodIndex === index ? { ...item, mandatory: event.target.value } : item) }))} /></label>
                  <button aria-label={`Hapus periode ${monthLabel(period.month)}`} className="icon-button danger" disabled={paymentForm.periods.length === 1} onClick={() => removePaymentPeriod(index)} title="Hapus periode" type="button"><Trash2 size={16} /></button>
                </div>)}
                <div className="payment-period-total"><span>Total iuran periode terpilih</span><strong>{rupiah.format(paymentPeriodTotal)}</strong></div>
              </div>
              <label>Bayar tunggakan<input type="number" min="0" step="1000" value={paymentForm.arrears} onChange={(event) => setPaymentForm({ ...paymentForm, arrears: event.target.value })} /></label>
              {Number(paymentForm.arrears) > 0 && <label>Pihak yang melunasi<select value={paymentForm.openingArrearsItemId} onChange={(event) => setPaymentForm({ ...paymentForm, openingArrearsItemId: event.target.value })}><option value="">{selectedOpeningArrearsItems.length ? 'Pilih debitur tunggakan' : 'Belum ada rincian debitur'}</option>{selectedOpeningArrearsItems.map((item) => <option key={item.id} value={item.id}>{item.debtorName} · {arrearsDebtorRoleLabel[item.debtorRole]} · sisa {rupiah.format(item.outstanding)}</option>)}</select></label>}
              <label className="wide">Catatan<input placeholder="Opsional" value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} /></label>
              <button className="primary-action wide" type="submit"><Plus size={18} />Simpan penerimaan iuran{paymentForm.periods.length > 1 ? ` (${paymentForm.periods.length} periode)` : ''}</button>
            </form>
          </section></div>
          <section className="panel history-panel"><div className="panel-title"><div><span>Riwayat penerimaan iuran wajib</span><h3>{selected.code}</h3></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Periode</th><th>Detail</th><th>Nilai</th><th>Metode</th><th /></tr></thead><tbody>{selectedDuesPayments.length ? selectedDuesPayments.map((payment) => { const duesAmount = payment.mandatoryAmount + payment.arrearsAmount; const arrearsDebtor = openingArrearsBalances.find((item) => item.id === payment.openingArrearsItemId); return <tr key={payment.id}><td>{payment.paymentDate}</td><td>{monthLabel(payment.month)}</td><td>{payment.arrearsAmount > 0 ? `Iuran + tunggakan${arrearsDebtor ? ` · ${arrearsDebtor.debtorName}` : ''}` : 'Iuran bulanan'}</td><td>{rupiah.format(duesAmount)}</td><td>{payment.method || '—'}</td><td><button className="icon-button danger" onClick={() => void removePayment(payment)} title="Hapus penerimaan"><Trash2 size={16} /></button></td></tr> }) : <tr><td colSpan={6}><div className="empty-state">Belum ada penerimaan iuran untuk akun ini.</div></td></tr>}</tbody></table></div></section>
        </>}

        {adminView === 'other-funds' && <>
          <div className="admin-heading"><div><span>Pencatatan dan kontrol dana</span><h2>Penerimaan Lain-Lain</h2><p>Catat penerimaan program, sumbangan, iuran hari raya, denda, dan penerimaan lainnya secara terpisah dari iuran wajib.</p></div><div className="admin-stat"><span>Total saldo dana titipan</span><strong>{rupiah.format(otherFunds.total)}</strong></div></div>
          <div className="admin-two-column other-receipt-entry">
            <section className="panel account-picker"><div className="panel-title"><div><span>35 akun warga</span><h3>Pilih akun</h3><p>Saldo yang tampil tidak termasuk denda.</p></div></div><OtherFundAccountGrid rows={otherFunds.accounts} selectedId={selected.id} onSelect={selectOtherReceiptAccount} /></section>
            <section className="panel form-card"><div className="selected-admin"><div className="house-avatar"><PiggyBank size={22} /></div><div><span>Akun terpilih</span><h3>{selected.code}</h3><p>{selected.residentName}</p></div></div>
              <form className="form-grid" onSubmit={savePayment}>
                <label>Tanggal penerimaan<input type="date" required value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} /></label>
                <label>Metode<select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select></label>
                <label>Periode penerimaan<input type="month" min="2026-01" required value={paymentForm.otherPeriod} onChange={(event) => setPaymentForm({ ...paymentForm, otherPeriod: event.target.value })} /></label>
                <label>Jenis penerimaan<select value={paymentForm.extraType} onChange={(event) => setPaymentForm({ ...paymentForm, extraType: event.target.value })}>{otherReceiptTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="wide">Nilai penerimaan<input type="number" min="0" step="1000" required value={paymentForm.otherAmount} onChange={(event) => setPaymentForm({ ...paymentForm, otherAmount: event.target.value })} /></label>
                <label className="wide">Catatan<input placeholder="Opsional" value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} /></label>
                <button className="primary-action wide" type="submit"><Plus size={18} />Simpan penerimaan lain-lain</button>
              </form>
            </section>
          </div>
          <section className="other-fund-summary admin-fund-summary">{otherFunds.categories.map((item) => <article className="other-fund-card" key={item.category}><div className="fund-icon"><PiggyBank size={20} /></div><span>{item.category}</span><strong>{rupiah.format(item.balance)}</strong></article>)}</section>
          <section className="panel fund-monitor-panel">
            <div className="panel-title"><div><span>Saldo per akun</span><h3>Rincian Dana Warga</h3><p>Nilai merupakan akumulasi penerimaan untuk masing-masing jenis dana.</p></div></div>
            <div className="table-wrap"><table className="other-fund-table"><thead><tr><th>Akun</th><th>Nama</th>{otherFundCategories.map((category) => <th key={category}>{category}</th>)}<th>Total</th></tr></thead><tbody>{otherFunds.accounts.length ? otherFunds.accounts.map(({ account, balances, total }) => <tr key={account.id}><td><strong>{account.code}</strong></td><td>{account.residentName}</td>{otherFundCategories.map((category) => { const balance = balances.get(category) ?? 0; return <td key={category}>{balance > 0 ? rupiah.format(balance) : '—'}</td> })}<td><strong>{rupiah.format(total)}</strong></td></tr>) : <tr><td colSpan={otherFundCategories.length + 3}><div className="empty-state">Belum ada saldo penerimaan lain-lain selain denda.</div></td></tr>}</tbody><tfoot><tr><td colSpan={2}>Total per jenis dana</td>{otherFunds.categories.map((item) => <td key={item.category}>{rupiah.format(item.balance)}</td>)}<td>{rupiah.format(otherFunds.total)}</td></tr></tfoot></table></div>
          </section>
          <section className="panel history-panel"><div className="panel-title"><div><span>Mutasi masuk</span><h3>Riwayat Penerimaan Lain-Lain</h3><p>Denda ditampilkan dalam riwayat, tetapi tidak masuk saldo dana titipan. Gunakan Jurnal Kas untuk mengedit atau menghapus catatan.</p></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Periode</th><th>Akun</th><th>Jenis dana</th><th>Nilai</th><th>Metode</th><th>Catatan</th></tr></thead><tbody>{otherFunds.allTransactions.length ? otherFunds.allTransactions.map(({ payment, account, category }) => <tr key={payment.id}><td>{payment.paymentDate}</td><td>{monthLabel(payment.month)}</td><td><strong>{account?.code ?? `CSJ ${String(payment.houseId).padStart(2, '0')}`}</strong></td><td>{category}{category === 'Denda' ? <small className="fine-label">Bukan dana titipan</small> : null}</td><td><strong>{rupiah.format(payment.extraAmount)}</strong></td><td>{payment.method || '—'}</td><td>{payment.notes || '—'}</td></tr>) : <tr><td colSpan={7}><div className="empty-state">Belum ada penerimaan lain-lain.</div></td></tr>}</tbody></table></div></section>
        </>}

        {adminView === 'expenses' && <>
          <div className="admin-heading"><div><span>Kas keluar</span><h2>Catat Pengeluaran</h2><p>Semua pengeluaran akan langsung muncul pada laporan warga.</p></div></div>
          <section className="panel form-card horizontal"><form className="form-grid expense-entry" onSubmit={saveExpense}>
            <label>Tanggal<input type="date" required value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} /></label>
            <label>Jenis pembayaran<select value={expenseForm.category} onChange={(e) => { const category = e.target.value; setExpenseForm({ ...expenseForm, category, detail: expenseDetailsByCategory[category][0] }) }}><option>Beban</option><option>Lainnya</option></select></label>
            <label>Detail pengeluaran<select value={expenseForm.detail} onChange={(e) => setExpenseForm({ ...expenseForm, detail: e.target.value })}>{expenseDetailsByCategory[expenseForm.category].map((detail) => <option key={detail}>{detail}</option>)}</select></label>
            <label>Jumlah<input type="number" min="0" step="1000" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></label>
            <label>Keterangan<input placeholder="Opsional" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} /></label>
            <button className="primary-action" type="submit"><Plus size={18} />Simpan</button>
          </form></section>
          <section className="panel history-panel"><div className="panel-title"><div><span>Riwayat</span><h3>Semua Pengeluaran</h3></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Kategori</th><th>Detail</th><th>Keterangan</th><th>Jumlah</th><th /></tr></thead><tbody>{data.expenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{legacyExpenseCategory[expense.category] ?? expense.category}</td><td>{expense.detail || legacyExpenseDetail[expense.category] || '—'}</td><td>{expense.description || '—'}</td><td><strong>{rupiah.format(expense.amount)}</strong></td><td><button className="icon-button danger" onClick={() => void removeExpense(expense)} title="Hapus pengeluaran"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div></section>
        </>}

        {adminView === 'receivables' && <>
          <div className="admin-heading"><div><span>Kontrol aset</span><h2>Piutang</h2><p>Catat pemberian dan penerimaan piutang secara terpisah. Penerimaan pelunasan mengurangi saldo piutang dan menambah kas, bukan pendapatan.</p></div><div className="admin-stat"><span>Total saldo piutang</span><strong>{rupiah.format(Array.from(receivableBalances.values()).reduce((sum, value) => sum + value, 0))}</strong></div></div>
          <div className="receivable-admin-grid">
            <section className="panel form-card"><div className="panel-title"><div><span>Transaksi baru</span><h3>Pemberian atau Penerimaan</h3></div></div><div className="receipt-kind-switch"><button className={receivableForm.transactionType === 'disbursement' ? 'active' : ''} onClick={() => setReceivableForm({ ...receivableForm, transactionType: 'disbursement' })} type="button"><WalletCards size={17} /><span>Pemberian Piutang<small>Mengurangi kas, menambah aset piutang</small></span></button><button className={receivableForm.transactionType === 'repayment' ? 'active' : ''} onClick={() => setReceivableForm({ ...receivableForm, transactionType: 'repayment' })} type="button"><Banknote size={17} /><span>Penerimaan Piutang<small>Pelunasan menambah kas, mengurangi aset piutang</small></span></button></div><form className="form-grid" onSubmit={saveReceivableTransaction}><label>Tanggal transaksi<input type="date" required value={receivableForm.date} onChange={(event) => setReceivableForm({ ...receivableForm, date: event.target.value })} /></label><label>Pihak peminjam<select value={receivableForm.debtor} onChange={(event) => setReceivableForm({ ...receivableForm, debtor: event.target.value })}>{receivableDebtors.map((debtor) => <option key={debtor}>{debtor}</option>)}</select></label><label>Jumlah<input type="number" min="0" step="1000" required value={receivableForm.amount} onChange={(event) => setReceivableForm({ ...receivableForm, amount: event.target.value })} /></label><label>Saldo saat ini<input disabled value={rupiah.format(receivableBalances.get(receivableForm.debtor) ?? 0)} /></label><label className="wide">Keterangan<input placeholder="Opsional" value={receivableForm.description} onChange={(event) => setReceivableForm({ ...receivableForm, description: event.target.value })} /></label><button className="primary-action wide" type="submit"><Plus size={18} />Simpan {receivableForm.transactionType === 'disbursement' ? 'pemberian piutang' : 'penerimaan piutang'}</button></form></section>
            <section className="panel receivable-balance-panel"><div className="panel-title"><div><span>Kontrol saldo</span><h3>Saldo per Peminjam</h3></div></div><div className="receivable-balance-list">{receivableDebtors.map((debtor) => <div key={debtor}><span>{debtor}</span><strong>{rupiah.format(receivableBalances.get(debtor) ?? 0)}</strong></div>)}</div></section>
          </div>
          <section className="panel history-panel"><div className="panel-title"><div><span>Riwayat</span><h3>Semua Transaksi Piutang</h3></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Peminjam</th><th>Keterangan</th><th>Jumlah</th><th /></tr></thead><tbody>{data.receivableTransactions.length ? data.receivableTransactions.map((transaction) => <tr key={transaction.id}><td>{transaction.date}</td><td><span className={`mini-status ${transaction.transactionType === 'repayment' ? 'paid' : 'due'}`}>{transaction.transactionType === 'disbursement' ? 'Pemberian' : 'Penerimaan/Pelunasan'}</span></td><td>{transaction.debtor}</td><td>{transaction.description || '—'}</td><td><strong>{rupiah.format(transaction.amount)}</strong></td><td><button className="icon-button danger" onClick={() => void removeReceivableTransaction(transaction)} title="Hapus transaksi piutang"><Trash2 size={16} /></button></td></tr>) : <tr><td colSpan={6}><div className="empty-state">Belum ada transaksi piutang.</div></td></tr>}</tbody></table></div></section>
        </>}

        {adminView === 'journal' && <>
          <div className="admin-heading journal-heading"><div><span>Kontrol rekening koran</span><h2>Jurnal Kas Terpadu</h2><p>Filter tahun dan bulan untuk memperpendek tampilan, lalu pilih urutan transaksi.</p></div><div className="journal-controls"><label>Tahun<select value={journalYear} onChange={(event) => setJournalYear(event.target.value)}><option value="all">Semua tahun</option>{journalYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>Bulan<select value={journalMonth} onChange={(event) => setJournalMonth(event.target.value)}><option value="all">Semua bulan</option>{paymentMonths.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</select></label><label>Urutan<select value={journalSort} onChange={(event) => setJournalSort(event.target.value as 'asc' | 'desc')}><option value="asc">Terlama → terbaru</option><option value="desc">Terbaru → terlama</option></select></label><label className="journal-search"><Search size={16} /><input placeholder="Cari transaksi…" value={journalQuery} onChange={(event) => setJournalQuery(event.target.value)} /></label></div></div>
          <section className="journal-summary-grid">
            <article><span>Saldo awal kas</span><strong>{rupiah.format(data.openingCashBalance)}</strong></article>
            <article className="cash-in"><span>Total kas masuk</span><strong>{rupiah.format(cashJournal.totalCashIn)}</strong></article>
            <article className="cash-out"><span>Total kas keluar</span><strong>{rupiah.format(cashJournal.totalCashOut)}</strong></article>
            <article className="closing"><span>Saldo akhir berjalan</span><strong>{rupiah.format(cashJournal.closingBalance)}</strong><small>{cashJournal.closingBalance === cash.cashBalance ? '✓ Sesuai saldo Ringkasan' : '⚠ Perlu diperiksa'}</small></article>
          </section>
          <section className="panel journal-panel"><div className="panel-title"><div><span>{filteredJournalRows.length} dari {cashJournal.rows.length} transaksi</span><h3>Urutan Transaksi Kas</h3><p>Saldo berjalan selalu dihitung kronologis meskipun urutan tampilan dibalik.</p></div><span className="journal-order-badge"><CalendarDays size={14} />{journalSort === 'asc' ? 'Terlama → terbaru' : 'Terbaru → terlama'}</span></div><div className="table-wrap"><table className="journal-table"><thead><tr><th>Tanggal</th><th>Sumber</th><th>Kategori dan detail</th><th>Keterangan</th><th>Kas masuk</th><th>Kas keluar</th><th>Saldo berjalan</th><th /></tr></thead><tbody>{filteredJournalRows.length ? filteredJournalRows.map((entry) => <tr key={entry.id}><td className="journal-date">{entry.date}</td><td><span className={`journal-source ${entry.source.toLowerCase()}`}>{entry.source}</span></td><td><strong>{entry.category}</strong><small>{entry.detail}</small></td><td>{entry.description}</td><td className="amount-in">{entry.cashIn ? rupiah.format(entry.cashIn) : '—'}</td><td className="amount-out">{entry.cashOut ? rupiah.format(entry.cashOut) : '—'}</td><td className="running-balance">{rupiah.format(entry.runningBalance)}</td><td><div className="journal-row-actions"><button className="icon-button journal-edit-button" onClick={() => openJournalEdit(entry)} title="Edit catatan jurnal"><Pencil size={15} /></button><button className="icon-button danger" onClick={() => void removeJournalEntry(entry)} title="Hapus catatan jurnal"><Trash2 size={15} /></button></div></td></tr>) : <tr><td colSpan={8}><div className="empty-state">Tidak ada transaksi untuk filter yang dipilih.</div></td></tr>}</tbody><tfoot><tr><td colSpan={4}>Total seluruh transaksi</td><td>{rupiah.format(cashJournal.totalCashIn)}</td><td>{rupiah.format(cashJournal.totalCashOut)}</td><td>{rupiah.format(cashJournal.closingBalance)}</td><td /></tr></tfoot></table></div></section>
        </>}

        {adminView === 'opening-arrears' && <>
          <div className="admin-heading"><div><span>Kontrol tunggakan historis</span><h2>Tunggakan s.d. 31 Desember 2025</h2><p>Kelola saldo per akun dan pihak yang bertanggung jawab secara terpisah dari data penghuni saat ini.</p></div><div className="admin-stat"><span>Sisa tunggakan tercatat</span><strong>{rupiah.format(totalTrackedOpeningArrears)}</strong></div></div>
          <div className="admin-two-column arrears-payment-entry">
            <section className="panel form-card"><div className="panel-title"><div><span>Kas masuk tunggakan lama</span><h3>Input Pembayaran Tunggakan</h3><p>Pembayaran akan menambah saldo kas dan mengurangi outstanding debitur.</p></div></div><form className="form-grid" onSubmit={saveOpeningArrearsPayment}>
              <label className="wide">Pihak yang membayar<select required value={arrearsPaymentForm.openingArrearsItemId} onChange={(event) => setArrearsPaymentForm({ ...arrearsPaymentForm, openingArrearsItemId: event.target.value })}><option value="">Pilih debitur tunggakan</option>{openingArrearsBalances.filter((item) => item.outstanding > 0).map((item) => <option key={item.id} value={item.id}>{item.debtorName} · sisa {rupiah.format(item.outstanding)}</option>)}</select></label>
              <label>Tanggal pembayaran<input type="date" required value={arrearsPaymentForm.paymentDate} onChange={(event) => setArrearsPaymentForm({ ...arrearsPaymentForm, paymentDate: event.target.value })} /></label>
              <label>Metode<select value={arrearsPaymentForm.method} onChange={(event) => setArrearsPaymentForm({ ...arrearsPaymentForm, method: event.target.value })}><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select></label>
              <label>Nilai pembayaran<input type="number" min="0" step="1000" required value={arrearsPaymentForm.amount} onChange={(event) => setArrearsPaymentForm({ ...arrearsPaymentForm, amount: event.target.value })} /></label>
              <label>Catatan<input placeholder="Opsional" value={arrearsPaymentForm.notes} onChange={(event) => setArrearsPaymentForm({ ...arrearsPaymentForm, notes: event.target.value })} /></label>
              <button className="primary-action wide" type="submit"><Plus size={18} />Simpan pembayaran tunggakan</button>
            </form></section>
            <section className="panel arrears-payment-history"><div className="panel-title"><div><span>Riwayat kas masuk</span><h3>Pembayaran Terakhir</h3><p>Gunakan Jurnal Kas untuk mengedit; tombol sampah tetap tersedia untuk menghapus.</p></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Debitur</th><th>Nilai</th><th /></tr></thead><tbody>{data.openingArrearsPayments.length ? [...data.openingArrearsPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).map((payment) => { const item = data.openingArrearsItems.find((row) => row.id === payment.openingArrearsItemId); return <tr key={payment.id}><td>{payment.paymentDate}</td><td><strong>{item?.debtorName ?? 'Tidak ditemukan'}</strong><small className="payment-method-note">{payment.method || '—'}</small></td><td>{rupiah.format(payment.amount)}</td><td><button className="icon-button danger" type="button" onClick={() => void removeOpeningArrearsPayment(payment)} title="Hapus pembayaran tunggakan"><Trash2 size={15} /></button></td></tr> }) : <tr><td colSpan={4}><div className="empty-state">Belum ada pembayaran tunggakan lama.</div></td></tr>}</tbody></table></div></section>
          </div>
          <section className="panel opening-arrears-panel">
            <div className="panel-title"><div><span>Kontrol saldo per akun</span><h3>Tagihan s.d. 31 Desember 2025</h3><p>Kosongkan kolom untuk menyimpan Rp0. Nilai tidak boleh lebih kecil dari rincian debitur yang sudah dialokasikan.</p></div></div>
            <div className="opening-arrears-grid">{accounts.map((account) => <label key={account.id}><span>{account.code}</span><div><input type="number" min="0" step="1000" placeholder="0" value={openingArrearsDrafts[account.id] ?? (account.openingArrears === 0 ? '' : String(account.openingArrears))} onChange={(event) => setOpeningArrearsDrafts((current) => ({ ...current, [account.id]: event.target.value }))} /><button className="small-action" type="button" onClick={() => void saveOpeningArrears(account)}>Simpan</button></div></label>)}</div>
          </section>
          <section className="panel arrears-detail-panel">
            <div className="panel-title"><div><span>Siapa yang bertanggung jawab</span><h3>Rincian Debitur Tunggakan Awal</h3><p>Nama debitur tetap tersimpan meskipun penyewa sudah pindah atau rumah berganti penghuni.</p></div><div className="admin-stat"><span>Sisa tunggakan tercatat</span><strong>{rupiah.format(totalTrackedOpeningArrears)}</strong></div></div>
            <form className="form-grid trace-form" onSubmit={saveOpeningArrearsItem}>
              <label>Nama pihak yang berutang<input required placeholder="Nama pemilik atau mantan penyewa" value={arrearsForm.debtorName} onChange={(event) => setArrearsForm({ ...arrearsForm, debtorName: event.target.value })} /></label>
              <label>Status pihak<select value={arrearsForm.debtorRole} onChange={(event) => setArrearsForm({ ...arrearsForm, debtorRole: event.target.value as ArrearsDebtorRole })}>{Object.entries(arrearsDebtorRoleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Rumah terkait<select value={arrearsForm.houseId} onChange={(event) => setArrearsForm({ ...arrearsForm, houseId: event.target.value })}><option value="">Belum diketahui / tidak terkait</option>{data.houses.map((house) => <option key={house.id} value={house.id}>{house.number}</option>)}</select></label>
              <label>Tanggal posisi<input type="date" required value={arrearsForm.cutoffDate} onChange={(event) => setArrearsForm({ ...arrearsForm, cutoffDate: event.target.value })} /></label>
              <label>Nilai tunggakan<input type="number" min="0" step="1000" required value={arrearsForm.originalAmount} onChange={(event) => setArrearsForm({ ...arrearsForm, originalAmount: event.target.value })} /></label>
              <label>Catatan<input placeholder="Contoh: rumah saat ini disewakan" value={arrearsForm.notes} onChange={(event) => setArrearsForm({ ...arrearsForm, notes: event.target.value })} /></label>
              <button className="primary-action wide" type="submit"><Plus size={18} />Tambah rincian tunggakan</button>
            </form>
            <div className="table-wrap"><table className="trace-table"><thead><tr><th>Rumah</th><th>Debitur</th><th>Status</th><th>Posisi</th><th>Nilai awal</th><th>Terbayar</th><th>Sisa</th><th>Catatan</th><th /></tr></thead><tbody>{openingArrearsBalances.length ? openingArrearsBalances.map((item) => <tr key={item.id}><td>{item.houseId ? data.houses.find((house) => house.id === item.houseId)?.number ?? `CSJ ${item.houseId}` : <span className="unlinked-label">Belum diketahui</span>}</td><td><strong>{item.debtorName}</strong></td><td>{arrearsDebtorRoleLabel[item.debtorRole]}</td><td>{item.cutoffDate}</td><td>{rupiah.format(item.originalAmount)}</td><td>{rupiah.format(item.settled)}</td><td><strong>{rupiah.format(item.outstanding)}</strong></td><td>{item.notes || '—'}</td><td><button className="icon-button danger" onClick={() => void removeOpeningArrearsItem(item)} title="Hapus rincian tunggakan" type="button"><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan={9}><div className="empty-state">Belum ada rincian debitur tunggakan awal.</div></td></tr>}</tbody></table></div>
          </section>
        </>}

        {adminView === 'houses' && <>
          <div className="admin-heading"><div><span>Data dasar</span><h2>Rumah dan Penghuni</h2><p>Kelola data rumah, penghuni aktif, serta riwayat perubahan penyewa.</p></div><input className="search-input" placeholder="Cari rumah atau nama…" value={houseQuery} onChange={(e) => setHouseQuery(e.target.value)} /></div>
          <section className="panel house-editor"><div className="panel-title"><div><span>Data penghuni saat ini</span><h3>Rumah dan Penghuni Aktif</h3><p>Ketika nama atau status penghuni berubah, riwayat aktif sebelumnya ditutup otomatis pada tanggal penyimpanan.</p></div></div><div className="table-wrap"><table><thead><tr><th>Rumah</th><th>Pemilik</th><th>Status</th><th>Penghuni/penyewa</th><th>Mulai sewa</th><th>Mulai tagihan</th><th /></tr></thead><tbody>{filteredHouses.map((house) => <tr key={house.id}><td><strong>{house.number}</strong>{house.id === 2 || house.id === 3 ? <small className="joint-note">Akun gabungan</small> : null}</td><td><input value={house.owner} onChange={(e) => patchHouse(house.id, { owner: e.target.value })} /></td><td><select value={house.residenceStatus} onChange={(e) => patchHouse(house.id, { residenceStatus: e.target.value as ResidenceStatus })}><option value="owner_occupied">Dihuni pemilik</option><option value="rented">Disewa</option><option value="empty">Kosong</option></select></td><td><input disabled={house.residenceStatus !== 'rented'} placeholder="Nama penyewa" value={house.tenant} onChange={(e) => patchHouse(house.id, { tenant: e.target.value })} /></td><td><input type="date" disabled={house.residenceStatus !== 'rented'} value={house.rentalStartDate} onChange={(e) => patchHouse(house.id, { rentalStartDate: e.target.value })} /></td><td><input type="month" min="2026-01" value={house.billingStartMonth} onChange={(e) => patchHouse(house.id, { billingStartMonth: e.target.value })} /></td><td><button className="small-action" type="button" onClick={() => void persistHouse(house)}>Simpan</button></td></tr>)}</tbody></table></div></section>
          <section className="panel occupancy-history-panel">
            <div className="panel-title"><div><span>Jejak perubahan</span><h3>Riwayat Penghuni</h3><p>Gunakan formulir ini untuk memasukkan periode lama. Penghuni aktif dikelola melalui tabel rumah di atas.</p></div></div>
            <form className="form-grid trace-form" onSubmit={saveOccupancy}>
              <label>Rumah<select value={occupancyForm.houseId} onChange={(event) => setOccupancyForm({ ...occupancyForm, houseId: event.target.value })}>{data.houses.map((house) => <option key={house.id} value={house.id}>{house.number}</option>)}</select></label>
              <label>Nama penghuni<input required value={occupancyForm.occupantName} onChange={(event) => setOccupancyForm({ ...occupancyForm, occupantName: event.target.value })} /></label>
              <label>Peran<select value={occupancyForm.occupantRole} onChange={(event) => setOccupancyForm({ ...occupancyForm, occupantRole: event.target.value as 'owner' | 'tenant' })}><option value="owner">Pemilik</option><option value="tenant">Penyewa</option></select></label>
              <label>Mulai menghuni<input type="date" required value={occupancyForm.startDate} onChange={(event) => setOccupancyForm({ ...occupancyForm, startDate: event.target.value })} /></label>
              <label>Selesai menghuni<input type="date" required value={occupancyForm.endDate} onChange={(event) => setOccupancyForm({ ...occupancyForm, endDate: event.target.value })} /></label>
              <label>Catatan<input placeholder="Opsional" value={occupancyForm.notes} onChange={(event) => setOccupancyForm({ ...occupancyForm, notes: event.target.value })} /></label>
              <button className="primary-action wide" type="submit"><Plus size={18} />Tambah periode penghuni lama</button>
            </form>
            <div className="table-wrap"><table className="trace-table"><thead><tr><th>Rumah</th><th>Nama</th><th>Peran</th><th>Mulai</th><th>Selesai</th><th>Catatan</th><th /></tr></thead><tbody>{data.houseOccupancies.length ? [...data.houseOccupancies].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((occupancy) => <tr key={occupancy.id}><td><strong>{data.houses.find((house) => house.id === occupancy.houseId)?.number ?? `CSJ ${occupancy.houseId}`}</strong></td><td>{occupancy.occupantName}</td><td>{occupantRoleLabel[occupancy.occupantRole]}</td><td>{occupancy.startDate}</td><td>{occupancy.endDate || <span className="current-occupant-badge">Aktif</span>}</td><td>{occupancy.notes || '—'}</td><td><button className="icon-button danger" disabled={!occupancy.endDate} onClick={() => void removeOccupancy(occupancy)} title={occupancy.endDate ? 'Hapus riwayat' : 'Penghuni aktif tidak dapat dihapus'} type="button"><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan={7}><div className="empty-state">Belum ada riwayat penghuni.</div></td></tr>}</tbody></table></div>
          </section>
        </>}

        {adminView === 'settings' && <><div className="admin-heading"><div><span>Konfigurasi</span><h2>Pengaturan Kas</h2><p>Kelola rekening pembayaran, saldo awal, dan riwayat tarif.</p></div></div><div className="settings-grid"><section className="panel form-card"><div className="panel-title"><div><span>Informasi publik</span><h3>Rekening dan Saldo Awal</h3></div></div><form className="form-grid" onSubmit={saveSettings}><label>Nama bank<input value={settingsForm.bankName} onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })} /></label><label>Nomor rekening<input value={settingsForm.bankAccountNumber} onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountNumber: e.target.value })} /></label><label>Nama pemilik rekening<input value={settingsForm.bankAccountHolder} onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountHolder: e.target.value })} /></label><label>Saldo awal kas<input type="number" step="1000" value={settingsForm.openingCashBalance} onChange={(e) => setSettingsForm({ ...settingsForm, openingCashBalance: e.target.value })} /></label><label className="wide">Tarif gabungan CSJ02 + CSJ03<input type="number" min="0" step="1000" value={settingsForm.jointFee0203} onChange={(e) => setSettingsForm({ ...settingsForm, jointFee0203: e.target.value })} /></label><button className="primary-action wide" type="submit">Simpan pengaturan</button></form></section><section className="panel form-card"><div className="panel-title"><div><span>Tarif efektif</span><h3>Tambah Riwayat Tarif</h3></div></div><div className="current-tariff"><span>Tarif {monthLabel(activeMonth)}</span><strong>Dihuni {rupiah.format(activeTariff.occupiedFee)} · Kosong {rupiah.format(activeTariff.emptyFee)}</strong></div><form className="form-grid" onSubmit={saveTariff}><label>Berlaku mulai<input type="date" value={tariffForm.effectiveDate} onChange={(e) => setTariffForm({ ...tariffForm, effectiveDate: e.target.value })} /></label><label>Tarif dihuni<input type="number" min="0" step="1000" value={tariffForm.occupiedFee} onChange={(e) => setTariffForm({ ...tariffForm, occupiedFee: e.target.value })} /></label><label>Tarif rumah kosong<input type="number" min="0" step="1000" value={tariffForm.emptyFee} onChange={(e) => setTariffForm({ ...tariffForm, emptyFee: e.target.value })} /></label><label>Catatan<input placeholder="Contoh: keputusan rapat warga" value={tariffForm.notes} onChange={(e) => setTariffForm({ ...tariffForm, notes: e.target.value })} /></label><button className="primary-action wide" type="submit"><Plus size={18} />Tambahkan tarif</button></form><div className="tariff-history">{[...data.tariffs].reverse().map((tariff) => <div key={tariff.id}><span>{tariff.effectiveDate}</span><strong>{rupiah.format(tariff.occupiedFee)} / {rupiah.format(tariff.emptyFee)}</strong></div>)}</div></section></div></>}
      </div>
    </section>}

    <footer><span>© SuwondoSoe</span><span>Data diperbarui langsung dari Supabase</span></footer>

    {showRecap && <div className="modal-backdrop" role="presentation"><section className="recap-dialog" role="dialog" aria-modal="true" aria-label={`Rekap pembayaran ${selected.code}`}>
      <button className="modal-close" onClick={() => setShowRecap(false)} aria-label="Tutup rekap"><X size={20} /></button>
      <div className="recap-heading"><div><span className="section-kicker">Rekap pembayaran</span><h2>{selected.code}</h2><p>{selected.residentName}{selected.houseIds.length === 2 ? ' · satu akun gabungan' : ''}</p></div><span className={`status-badge ${currentRecapStatement.isPaid ? 'paid' : 'due'}`}>{currentRecapStatement.isPaid ? 'Lunas' : 'Belum lunas'}</span></div>
      <div className="recap-year-tabs" aria-label="Pilih tahun rekap">{availableReportYears.map((year) => <button className={recapYear === year ? 'active' : ''} key={year} onClick={() => setRecapYear(year)} type="button">{year}</button>)}<button className="add-year" onClick={() => setMaxReportYear((year) => year + 1)} type="button"><Plus size={14} />{availableReportYears.at(-1)! + 1}</button></div>
      <div className="cumulative-due"><div><span>Kumulatif belum terbayar</span><small>Sampai halaman dibuka pada {pageOpenedLabel}</small></div><strong>{rupiah.format(currentRecapStatement.totalOutstanding)}</strong></div>
      <div className="prior-arrears"><div><span>Tagihan sampai 31 Desember 2025</span><small>Nilai ini diisi manual oleh pengurus.</small></div><strong>{rupiah.format(selected.openingArrears)}</strong></div>
      <div className="month-recap-grid">{monthlyRecap.map((item) => {
        const state = item.isNotApplicable ? 'not-applicable' : item.isPending ? 'pending' : item.isPaid ? 'paid' : item.isPartial ? 'partial' : item.isFuture ? 'future' : 'due'
        return <article className={state} key={item.month}><div className="month-status-icon">{item.isPending ? <CircleAlert size={18} /> : item.isNotApplicable || item.isFuture ? <CalendarDays size={17} /> : item.isPaid ? <Check size={19} /> : item.isPartial ? <CircleAlert size={18} /> : <X size={19} />}</div><div><strong>{monthLabel(item.month)}</strong><span>{item.isNotApplicable ? 'Belum mulai tagihan' : item.isPending ? 'Menunggu konfirmasi' : item.isPaid ? 'Lunas' : item.isPartial ? 'Dibayar sebagian' : item.isFuture ? 'Belum jatuh tempo' : 'Belum dibayar'}</span></div>{(state === 'due' || state === 'partial') && <div className="month-outstanding"><span>{state === 'partial' ? 'Sisa terutang' : 'Terutang'}</span><strong>{rupiah.format(item.outstanding)}</strong></div>}{state === 'pending' && <div className="month-pending-note"><span>{item.pendingNotes}</span><strong>{rupiah.format(item.outstanding)}</strong></div>}</article>
      })}</div>
      <div className="recap-legend"><span><i className="dot paid" />Hijau: lunas</span><span><i className="dot due" />Merah ✕: belum lunas</span><span><i className="dot partial" />Merah muda: dibayar sebagian</span><span><i className="dot pending" />Kuning: menunggu konfirmasi</span><span><i className="dot future" />Abu-abu: belum jatuh tempo</span></div>
    </section></div>}

    {showOtherFundDetail && selectedOtherFundAccount && <div className="modal-backdrop" role="presentation"><section className="recap-dialog other-fund-detail-dialog" role="dialog" aria-modal="true" aria-label={`Detail penerimaan lain-lain ${selectedOtherFundAccount.account.code}`}>
      <button className="modal-close" onClick={() => setShowOtherFundDetail(false)} aria-label="Tutup detail"><X size={20} /></button>
      <div className="recap-heading"><div><span className="section-kicker">Penerimaan lain-lain</span><h2>{selectedOtherFundAccount.account.code}</h2><p>{selectedOtherFundAccount.account.residentName}</p></div><div className="detail-fund-total"><span>Total saldo</span><strong>{rupiah.format(selectedOtherFundAccount.total)}</strong></div></div>
      <div className="other-fund-summary detail-fund-summary">{otherFundCategories.map((category) => <article className="other-fund-card" key={category}><div className="fund-icon"><PiggyBank size={19} /></div><span>{category}</span><strong>{rupiah.format(selectedOtherFundAccount.balances.get(category) ?? 0)}</strong></article>)}</div>
      <div className="detail-fund-history"><div className="panel-title"><div><span>Rincian pembayaran</span><h3>Mutasi per Periode</h3><p>Denda tidak termasuk dalam saldo dan rincian dana titipan ini.</p></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Periode</th><th>Jenis dana</th><th>Nilai</th></tr></thead><tbody>{selectedOtherFundTransactions.length ? selectedOtherFundTransactions.map(({ payment, category }) => <tr key={payment.id}><td>{payment.paymentDate}</td><td>{monthLabel(payment.month)}</td><td>{normalizeOtherFundCategory(category)}</td><td><strong>{rupiah.format(payment.extraAmount)}</strong></td></tr>) : <tr><td colSpan={4}><div className="empty-state">Belum ada pembayaran penerimaan lain-lain untuk akun ini.</div></td></tr>}</tbody></table></div></div>
    </section></div>}

    {journalEdit && <div className="modal-backdrop" role="presentation"><section className="login-dialog journal-edit-dialog" role="dialog" aria-modal="true" aria-label="Edit catatan jurnal">
      <button className="modal-close" onClick={() => { setJournalEdit(null); setError('') }} aria-label="Tutup edit jurnal"><X size={20} /></button>
      <div className="login-icon"><Pencil size={25} /></div><span className="section-kicker">Jurnal kas terpadu</span><h2>Edit Catatan</h2><p>{journalEdit.entry.category} · {journalEdit.entry.detail}. Perubahan akan langsung menghitung ulang saldo berjalan.</p>
      {error && <div className="error-banner journal-edit-error"><CircleAlert size={17} /><span>{error}</span></div>}
      <form className="form-grid" onSubmit={saveJournalEdit}>
        <label>Tanggal transaksi<input type="date" required value={journalEdit.date} onChange={(event) => setJournalEdit({ ...journalEdit, date: event.target.value })} /></label>
        {(journalEdit.entry.entityType === 'payment-dues' || journalEdit.entry.entityType === 'payment-other') && <label>Periode<input type="month" min="2026-01" required value={journalEdit.month} onChange={(event) => setJournalEdit({ ...journalEdit, month: event.target.value })} /></label>}
        {journalEdit.entry.entityType === 'payment-dues' && <><label>Iuran periode<input type="number" min="0" step="1000" value={journalEdit.mandatoryAmount} onChange={(event) => setJournalEdit({ ...journalEdit, mandatoryAmount: event.target.value })} /></label><label>Pelunasan tunggakan<input type="number" min="0" step="1000" value={journalEdit.arrearsAmount} onChange={(event) => setJournalEdit({ ...journalEdit, arrearsAmount: event.target.value })} /></label></>}
        {journalEdit.entry.entityType === 'payment-other' && <><label>Jenis penerimaan<select value={journalEdit.extraType} onChange={(event) => setJournalEdit({ ...journalEdit, extraType: event.target.value })}>{otherReceiptTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Nilai penerimaan<input type="number" min="0" step="1000" required value={journalEdit.extraAmount} onChange={(event) => setJournalEdit({ ...journalEdit, extraAmount: event.target.value })} /></label></>}
        {(journalEdit.entry.entityType === 'payment-dues' || journalEdit.entry.entityType === 'payment-other') && <label>Metode<select value={journalEdit.method} onChange={(event) => setJournalEdit({ ...journalEdit, method: event.target.value })}><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select></label>}
        {journalEdit.entry.entityType === 'opening-arrears' && <><label>Nilai pembayaran tunggakan<input type="number" min="0" step="1000" required value={journalEdit.amount} onChange={(event) => setJournalEdit({ ...journalEdit, amount: event.target.value })} /></label><label>Metode<select value={journalEdit.method} onChange={(event) => setJournalEdit({ ...journalEdit, method: event.target.value })}><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select></label></>}
        {journalEdit.entry.entityType === 'expense' && <><label>Jenis pembayaran<select value={journalEdit.category} onChange={(event) => { const category = event.target.value; setJournalEdit({ ...journalEdit, category, detail: expenseDetailsByCategory[category][0] }) }}><option>Beban</option><option>Lainnya</option></select></label><label>Detail pengeluaran<select value={journalEdit.detail} onChange={(event) => setJournalEdit({ ...journalEdit, detail: event.target.value })}>{expenseDetailsByCategory[journalEdit.category].map((detail) => <option key={detail}>{detail}</option>)}</select></label><label>Jumlah pengeluaran<input type="number" min="0" step="1000" required value={journalEdit.amount} onChange={(event) => setJournalEdit({ ...journalEdit, amount: event.target.value })} /></label></>}
        {journalEdit.entry.entityType === 'receivable' && <><label>Jenis transaksi<select value={journalEdit.transactionType} onChange={(event) => setJournalEdit({ ...journalEdit, transactionType: event.target.value as 'disbursement' | 'repayment' })}><option value="disbursement">Pemberian Piutang</option><option value="repayment">Penerimaan/Pelunasan Piutang</option></select></label><label>Pihak peminjam<select value={journalEdit.debtor} onChange={(event) => setJournalEdit({ ...journalEdit, debtor: event.target.value })}>{receivableDebtors.map((debtor) => <option key={debtor}>{debtor}</option>)}</select></label><label>Jumlah transaksi<input type="number" min="0" step="1000" required value={journalEdit.amount} onChange={(event) => setJournalEdit({ ...journalEdit, amount: event.target.value })} /></label></>}
        <label className="wide">Keterangan<input placeholder="Opsional" value={journalEdit.notes} onChange={(event) => setJournalEdit({ ...journalEdit, notes: event.target.value })} /></label>
        <button className="primary-action wide" type="submit"><Check size={18} />Simpan perubahan</button>
      </form>
    </section></div>}

    {showLogin && <div className="modal-backdrop" role="presentation"><section className="login-dialog" role="dialog" aria-modal="true" aria-label="Login admin"><button className="modal-close" onClick={() => setShowLogin(false)} aria-label="Tutup"><X size={20} /></button><div className="login-icon"><ShieldCheck size={28} /></div><span className="section-kicker">Akses pengurus</span><h2>Login Admin</h2><p>Masuk untuk mencatat pembayaran, pengeluaran, dan memperbarui data warga.</p><form onSubmit={signIn}><label>Email<input type="email" autoComplete="email" required value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} /></label><label>Kata sandi<input type="password" autoComplete="current-password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /></label><button className="primary-action" type="submit"><LogIn size={18} />Masuk</button></form></section></div>}
  </main>
}

export default App
