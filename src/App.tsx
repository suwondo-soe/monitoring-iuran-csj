import {
  Banknote,
  CalendarDays,
  Check,
  Cloud,
  Download,
  Home,
  Landmark,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  ReceiptText,
  Search,
  Settings,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  createRemoteExpense,
  createRemotePayment,
  currentUserIsAdmin,
  loadRemoteLedger,
  updateRemoteHouse,
  updateRemoteOpeningBalance,
} from './lib/ledgerRepository'
import { supabase, supabaseConfigured } from './lib/supabase'
import type {
  Expense,
  House,
  LedgerData,
  Payment,
  ResidenceStatus,
  Tab,
} from './types'

const OCCUPIED_FEE = 185000
const EMPTY_FEE = 145000
const STORAGE_KEY = 'keuangan-csj-ledger-v1'

const defaultHouses: House[] = [
  {
    id: 1,
    number: 'CSJ 1',
    owner: 'Dwi Nanung/Ayu',
    residenceStatus: 'rented',
    tenant: 'Ardani/Amelia',
    rentalStartDate: '2026-01-01',
    openingArrears: 0,
  },
  {
    id: 2,
    number: 'CSJ 2',
    owner: 'Anky/Glady',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
    monthlyFeeOverride: 157500,
  },
  {
    id: 3,
    number: 'CSJ 3',
    owner: 'Anky/Glady',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
    monthlyFeeOverride: 157500,
  },
  {
    id: 4,
    number: 'CSJ 4',
    owner: 'Qomar/Intan Widya',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 5,
    number: 'CSJ 5',
    owner: 'Muh. Basyir / Ova',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 6,
    number: 'CSJ 6',
    owner: 'Irfan/Windi',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 7,
    number: 'CSJ 7',
    owner: 'Desis/Koko',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 8,
    number: 'CSJ 8',
    owner: 'Melda NyataJaya',
    residenceStatus: 'rented',
    tenant: 'Farid/Yanne',
    rentalStartDate: '2026-01-01',
    openingArrears: 0,
  },
  {
    id: 9,
    number: 'CSJ 9',
    owner: 'Sigit',
    residenceStatus: 'rented',
    tenant: 'M. Andi/Nisa',
    rentalStartDate: '2026-01-01',
    openingArrears: 0,
  },
  {
    id: 10,
    number: 'CSJ 10',
    owner: 'Hakim/Indah',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 11,
    number: 'CSJ 11',
    owner: 'Yuli Adi/Lisa',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 12,
    number: 'CSJ 12',
    owner: 'Fadel',
    residenceStatus: 'rented',
    tenant: 'Jihad/Risa',
    rentalStartDate: '2026-08-01',
    openingArrears: 0,
  },
  {
    id: 13,
    number: 'CSJ 13',
    owner: 'Nasrul',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 14,
    number: 'CSJ 14',
    owner: 'Rahmad/Wety',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 15,
    number: 'CSJ 15',
    owner: 'Ferdian/Yayah',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 16,
    number: 'CSJ 16',
    owner: 'Sepino/Prima',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 17,
    number: 'CSJ 17',
    owner: 'Dede/Mega',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 18,
    number: 'CSJ 18',
    owner: 'Adib A. Rahman',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 19,
    number: 'CSJ 19',
    owner: 'Deny Haryanto',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 20,
    number: 'CSJ 20',
    owner: 'Dwi Pratiknyo',
    residenceStatus: 'empty',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 21,
    number: 'CSJ 21',
    owner: 'Robien',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 22,
    number: 'CSJ 22',
    owner: 'Suwondo',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 23,
    number: 'CSJ 23',
    owner: 'Oma',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 24,
    number: 'CSJ 24',
    owner: 'Tika',
    residenceStatus: 'empty',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 25,
    number: 'CSJ 25',
    owner: 'Aldhi Givvari',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 26,
    number: 'CSJ 26',
    owner: 'Ahmad Budiarjo 1',
    residenceStatus: 'rented',
    tenant: 'Babay/Lina',
    rentalStartDate: '2026-01-01',
    openingArrears: 0,
  },
  {
    id: 27,
    number: 'CSJ 27',
    owner: 'Ahmad Budiarjo 2',
    residenceStatus: 'rented',
    tenant: 'Ismail',
    rentalStartDate: '2026-01-01',
    openingArrears: 0,
  },
  {
    id: 28,
    number: 'CSJ 28',
    owner: 'Rolandi Situmorang',
    residenceStatus: 'empty',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 29,
    number: 'CSJ 29',
    owner: 'Arif Rifana/Gina',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 30,
    number: 'CSJ 30',
    owner: 'Frans',
    residenceStatus: 'rented',
    tenant: 'Aria Marta',
    rentalStartDate: '2026-01-01',
    openingArrears: 0,
  },
  {
    id: 31,
    number: 'CSJ 31',
    owner: 'Fiqih/Asih',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 32,
    number: 'CSJ 32',
    owner: 'Yusron',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 33,
    number: 'CSJ 33',
    owner: 'Rama',
    residenceStatus: 'empty',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 34,
    number: 'CSJ 34',
    owner: 'Nunik',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 35,
    number: 'CSJ 35',
    owner: 'Rosyidi/Anizar 1',
    residenceStatus: 'owner_occupied',
    tenant: '',
    rentalStartDate: '',
    openingArrears: 0,
  },
  {
    id: 36,
    number: 'CSJ 36',
    owner: 'Rosyidi/Anizar 1',
    residenceStatus: 'rented',
    tenant: 'Angga/Intan Andriani',
    rentalStartDate: '2026-01-01',
    openingArrears: 0,
  },
]

const monthNow = () => new Date().toISOString().slice(0, 7)
const dateNow = () => new Date().toISOString().slice(0, 10)
const feeFor = (house: House) =>
  house.monthlyFeeOverride ??
  (house.residenceStatus === 'empty' ? EMPTY_FEE : OCCUPIED_FEE)
const dueForHouse = (house: House, payments: Payment[], month: string) => {
  const paid = payments
    .filter((payment) => payment.houseId === house.id && payment.month === month)
    .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)

  return Math.max(feeFor(house) - paid, 0)
}
const arrearsForHouse = (house: House, payments: Payment[]) => {
  const paid = payments
    .filter((payment) => payment.houseId === house.id)
    .reduce((sum, payment) => sum + (payment.arrearsAmount ?? 0), 0)

  return Math.max((house.openingArrears ?? 0) - paid, 0)
}
const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const residenceLabel: Record<ResidenceStatus, string> = {
  owner_occupied: 'Owner occupied',
  rented: 'Rented',
  empty: 'Empty',
}

const initialData = (): LedgerData => {
  const fallback = {
    houses: defaultHouses,
    payments: [],
    expenses: [],
    openingCashBalance: 0,
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return fallback
    const parsed = JSON.parse(stored) as LedgerData

    return {
      houses: defaultHouses.map((seedHouse) => {
        const storedHouse = parsed.houses?.find((house) => house.id === seedHouse.id)

        if (!storedHouse) return seedHouse
        return {
          ...seedHouse,
          ...storedHouse,
          openingArrears: Number(storedHouse.openingArrears ?? 0),
          monthlyFeeOverride:
            storedHouse.monthlyFeeOverride ?? seedHouse.monthlyFeeOverride ?? null,
        }
      }),
      payments: Array.isArray(parsed.payments)
        ? parsed.payments.map((payment) => ({
            ...payment,
            paymentDate: payment.paymentDate ?? `${payment.month}-01`,
            arrearsAmount: Number(payment.arrearsAmount ?? 0),
          }))
        : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      openingCashBalance: Number(parsed.openingCashBalance ?? 0),
    }
  } catch {
    return fallback
  }
}

function toCsv(rows: Record<string, string | number>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n')
}

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [data, setData] = useState<LedgerData>(() => initialData())
  const [isAdmin, setIsAdmin] = useState(!supabaseConfigured)
  const [isLoading, setIsLoading] = useState(supabaseConfigured)
  const [showLogin, setShowLogin] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [activeMonth, setActiveMonth] = useState(monthNow())
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [selectedHouseId, setSelectedHouseId] = useState(1)
  const [query, setQuery] = useState('')
  const [paymentForm, setPaymentForm] = useState({
    mandatoryAmount: String(OCCUPIED_FEE),
    arrearsAmount: '0',
    extraAmount: '0',
    extraType: 'None',
    method: 'Cash',
    notes: '',
  })
  const [expenseForm, setExpenseForm] = useState({
    date: dateNow(),
    category: 'Security',
    amount: '',
    description: '',
  })

  const canEdit = !supabaseConfigured || isAdmin

  useEffect(() => {
    if (!supabaseConfigured) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
  }, [data])

  useEffect(() => {
    if (!supabase) return
    let active = true

    const syncRemoteState = async () => {
      try {
        const [ledger, admin] = await Promise.all([
          loadRemoteLedger(),
          currentUserIsAdmin(),
        ])
        if (!active) return
        setData(ledger)
        setIsAdmin(admin)
        setStatusMessage('')
      } catch (error) {
        if (!active) return
        setStatusMessage(
          error instanceof Error ? error.message : 'Unable to load Supabase data.',
        )
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void syncRemoteState()
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void syncRemoteState()
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const selectedHouse =
    data.houses.find((house) => house.id === selectedHouseId) ?? data.houses[0]

  const monthPayments = useMemo(
    () => data.payments.filter((payment) => payment.month === activeMonth),
    [activeMonth, data.payments],
  )

  const monthExpenses = useMemo(
    () => data.expenses.filter((expense) => expense.date.startsWith(activeMonth)),
    [activeMonth, data.expenses],
  )

  const houseStats = useMemo(() => {
    return data.houses.map((house) => {
      const expected = feeFor(house)
      const payments = monthPayments.filter((payment) => payment.houseId === house.id)
      const mandatoryPaid = payments.reduce(
        (sum, payment) => sum + payment.mandatoryAmount,
        0,
      )
      const arrearsPaid = data.payments
        .filter((payment) => payment.houseId === house.id)
        .reduce((sum, payment) => sum + (payment.arrearsAmount ?? 0), 0)
      const extraPaid = payments.reduce((sum, payment) => sum + payment.extraAmount, 0)
      const balance = Math.max(expected - mandatoryPaid, 0)
      const arrearsBalance = Math.max(house.openingArrears - arrearsPaid, 0)
      const totalOutstanding = balance + arrearsBalance

      return {
        ...house,
        expected,
        mandatoryPaid,
        arrearsPaid,
        extraPaid,
        totalPaid: mandatoryPaid + extraPaid,
        balance,
        arrearsBalance,
        totalOutstanding,
        paid: mandatoryPaid >= expected && arrearsBalance === 0,
      }
    })
  }, [data.houses, data.payments, monthPayments])

  const selectedStats =
    houseStats.find((house) => house.id === selectedHouseId) ?? houseStats[0]

  const summary = useMemo(() => {
    const expected = houseStats.reduce((sum, house) => sum + house.expected, 0)
    const mandatory = houseStats.reduce((sum, house) => sum + house.mandatoryPaid, 0)
    const arrearsPaid = monthPayments.reduce(
      (sum, payment) => sum + (payment.arrearsAmount ?? 0),
      0,
    )
    const arrearsRemaining = houseStats.reduce(
      (sum, house) => sum + house.arrearsBalance,
      0,
    )
    const extra = houseStats.reduce((sum, house) => sum + house.extraPaid, 0)
    const expenses = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    const unpaid = houseStats.filter((house) => !house.paid).length

    return {
      expected,
      mandatory,
      extra,
      arrearsPaid,
      arrearsRemaining,
      received: mandatory + extra + arrearsPaid,
      expenses,
      balance: data.openingCashBalance + mandatory + extra + arrearsPaid - expenses,
      unpaid,
      paid: houseStats.length - unpaid,
    }
  }, [data.openingCashBalance, houseStats, monthExpenses, monthPayments])

  const filteredHouses = houseStats.filter((house) => {
    const text = `${house.number} ${house.owner} ${house.tenant}`.toLowerCase()
    return text.includes(query.toLowerCase())
  })

  const selectHouse = (houseId: number) => {
    const house = data.houses.find((item) => item.id === houseId)
    if (!house) return

    setSelectedHouseId(houseId)
    setPaymentForm((current) => ({
      ...current,
      mandatoryAmount: String(dueForHouse(house, data.payments, activeMonth)),
      arrearsAmount: String(arrearsForHouse(house, data.payments)),
    }))
  }

  const changeMonth = (month: string) => {
    setActiveMonth(month)
    setPaymentForm((current) => ({
      ...current,
      mandatoryAmount: String(dueForHouse(selectedHouse, data.payments, month)),
      arrearsAmount: String(arrearsForHouse(selectedHouse, data.payments)),
    }))
  }

  const updateHouse = (houseId: number, updates: Partial<House>) => {
    const updatedHouse = {
      ...data.houses.find((house) => house.id === houseId),
      ...updates,
    } as House

    setData((current) => ({
      ...current,
      houses: current.houses.map((house) =>
        house.id === houseId ? { ...house, ...updates } : house,
      ),
    }))

    if (houseId === selectedHouseId) {
      setPaymentForm((current) => ({
        ...current,
        mandatoryAmount: String(dueForHouse(updatedHouse, data.payments, activeMonth)),
        arrearsAmount: String(arrearsForHouse(updatedHouse, data.payments)),
      }))
    }
  }

  const persistHouse = async (houseId: number) => {
    if (!supabaseConfigured) return
    const house = data.houses.find((item) => item.id === houseId)
    if (!house) return
    try {
      await updateRemoteHouse(house)
      setStatusMessage(`${house.number} saved.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'House update failed.')
    }
  }

  const savePayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!canEdit) return
    const payment: Payment = {
      id: crypto.randomUUID(),
      houseId: selectedHouse.id,
      month: activeMonth,
      paymentDate: dateNow(),
      mandatoryAmount: Number(paymentForm.mandatoryAmount || 0),
      arrearsAmount: Number(paymentForm.arrearsAmount || 0),
      extraAmount: Number(paymentForm.extraAmount || 0),
      extraType: paymentForm.extraType,
      method: paymentForm.method,
      notes: paymentForm.notes.trim(),
    }

    if (
      payment.mandatoryAmount + payment.arrearsAmount + payment.extraAmount <= 0
    ) {
      setStatusMessage('Payment amount must be greater than zero.')
      return
    }

    try {
      if (supabaseConfigured) await createRemotePayment(payment)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Payment failed.')
      return
    }

    setData((current) => ({
      ...current,
      payments: [payment, ...current.payments],
    }))
    setPaymentForm({
      mandatoryAmount: '0',
      arrearsAmount: '0',
      extraAmount: '0',
      extraType: 'None',
      method: paymentForm.method,
      notes: '',
    })
    setStatusMessage('Payment saved.')
  }

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault()
    if (!canEdit) return
    if (!Number(expenseForm.amount)) return

    const expense: Expense = {
      id: crypto.randomUUID(),
      date: expenseForm.date,
      category: expenseForm.category,
      amount: Number(expenseForm.amount),
      description: expenseForm.description.trim(),
    }

    try {
      if (supabaseConfigured) await createRemoteExpense(expense)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Expense failed.')
      return
    }

    setData((current) => ({
      ...current,
      expenses: [expense, ...current.expenses],
    }))
    setExpenseForm({
      date: dateNow(),
      category: expenseForm.category,
      amount: '',
      description: '',
    })
    setStatusMessage('Expense saved.')
  }

  const saveOpeningBalance = async () => {
    if (!supabaseConfigured) return
    try {
      await updateRemoteOpeningBalance(data.openingCashBalance)
      setStatusMessage('Opening balance saved.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Balance update failed.')
    }
  }

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setStatusMessage('Signing in...')
    const { error } = await supabase.auth.signInWithPassword(loginForm)
    if (error) {
      setStatusMessage(error.message)
      return
    }
    setShowLogin(false)
    setLoginForm({ email: '', password: '' })
    setStatusMessage('Admin session active.')
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setIsAdmin(false)
    setStatusMessage('Signed out.')
  }

  const exportPayments = () => {
    downloadCsv(
      `csj-payments-${activeMonth}.csv`,
      monthPayments.map((payment) => {
        const house = data.houses.find((item) => item.id === payment.houseId)
        return {
          month: payment.month,
          house_number: house?.number ?? '',
          owner: house?.owner ?? '',
          mandatory_amount: payment.mandatoryAmount,
          arrears_amount: payment.arrearsAmount,
          extra_amount: payment.extraAmount,
          extra_type: payment.extraType,
          method: payment.method,
          notes: payment.notes,
        }
      }),
    )
  }

  const exportExpenses = () => {
    downloadCsv(
      `csj-expenses-${activeMonth}.csv`,
      monthExpenses.map((expense) => ({
        date: expense.date,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
      })),
    )
  }

  const exportMonthlyReport = () => {
    downloadCsv(
      `csj-monthly-report-${activeMonth}.csv`,
      houseStats.map((house) => ({
        month: activeMonth,
        house_number: house.number,
        owner: house.owner,
        residence_status: house.residenceStatus,
        tenant: house.tenant,
        rental_start_date: house.rentalStartDate,
        expected_mandatory: house.expected,
        mandatory_paid: house.mandatoryPaid,
        opening_arrears: house.openingArrears,
        arrears_paid: house.arrearsPaid,
        arrears_remaining: house.arrearsBalance,
        extra_paid: house.extraPaid,
        current_month_outstanding: house.balance,
        total_outstanding: house.totalOutstanding,
        status: house.paid ? 'Paid' : 'Unpaid',
      })),
    )
  }

  const selectedHistory = data.payments
    .filter((payment) => payment.houseId === selectedHouse.id)
    .slice(0, 6)

  if (isLoading) {
    return (
      <main className="app-shell loading-shell">
        <LoaderCircle className="spin" size={28} />
        <p>Loading neighbourhood ledger...</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Neighbourhood treasury</p>
          <h1>Keuangan CSJ</h1>
        </div>
        <div className="topbar-actions">
          <label className="opening-cash">
            <Landmark size={18} />
            <span>Opening cash</span>
            <input
              aria-label="Opening cash balance"
              min="0"
              step="1000"
              type="number"
              value={data.openingCashBalance}
              disabled={!canEdit}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  openingCashBalance: Number(event.target.value || 0),
                }))
              }
              onBlur={() => void saveOpeningBalance()}
            />
          </label>
          <label className="month-picker">
            <CalendarDays size={18} />
            <input
              aria-label="Active month"
              type="month"
              value={activeMonth}
              onChange={(event) => changeMonth(event.target.value)}
            />
          </label>
          <span className="data-source">
            <Cloud size={17} />
            {supabaseConfigured ? 'Supabase' : 'Local mode'}
          </span>
          {supabaseConfigured &&
            (isAdmin ? (
              <button className="secondary-action" onClick={() => void signOut()} type="button">
                <LogOut size={17} />
                Sign out
              </button>
            ) : (
              <button
                className="secondary-action"
                onClick={() => setShowLogin(true)}
                type="button"
              >
                <LogIn size={17} />
                Admin login
              </button>
            ))}
        </div>
      </header>

      {statusMessage && (
        <div className="status-banner" role="status">
          {statusMessage}
        </div>
      )}

      <nav className="tabbar" aria-label="Dashboard pages">
        <button
          className={activeTab === 'summary' ? 'active' : ''}
          onClick={() => setActiveTab('summary')}
          type="button"
        >
          <Banknote size={18} />
          Summary
        </button>
        <button
          className={activeTab === 'collection' ? 'active' : ''}
          onClick={() => setActiveTab('collection')}
          type="button"
        >
          <ReceiptText size={18} />
          Collection
        </button>
        <button
          className={activeTab === 'expenses' ? 'active' : ''}
          onClick={() => setActiveTab('expenses')}
          type="button"
        >
          <WalletCards size={18} />
          Expenses
        </button>
      </nav>

      {activeTab === 'summary' && (
        <section className="page-layer">
          <section className="balance-hero" aria-label="Cash balance">
            <div>
              <p className="eyebrow">Current cash balance</p>
              <strong>{rupiah.format(summary.balance)}</strong>
            </div>
            <div className="balance-breakdown">
              <span>Opening {rupiah.format(data.openingCashBalance)}</span>
              <span>Revenue {rupiah.format(summary.received)}</span>
              <span>Expenses {rupiah.format(summary.expenses)}</span>
            </div>
          </section>

          <section className="summary-grid" aria-label="Monthly summary">
            <article className="metric">
              <span>Expected</span>
              <strong>{rupiah.format(summary.expected)}</strong>
            </article>
            <article className="metric good">
              <span>Received</span>
              <strong>{rupiah.format(summary.received)}</strong>
            </article>
            <article className="metric">
              <span>Expenses</span>
              <strong>{rupiah.format(summary.expenses)}</strong>
            </article>
            <article className="metric alert">
              <span>Total tunggakan</span>
              <strong>{rupiah.format(summary.arrearsRemaining)}</strong>
            </article>
            <article className="metric alert">
              <span>Unpaid houses</span>
              <strong>{summary.unpaid}</strong>
            </article>
          </section>

          <section className="summary-details">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">In arrear balance</p>
                  <h2>Outstanding Houses</h2>
                </div>
                <button
                  className="secondary-action"
                  onClick={exportMonthlyReport}
                  type="button"
                >
                  <Download size={18} />
                  Monthly report
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>House</th>
                      <th>Payer</th>
                      <th>Monthly Due</th>
                      <th>Arrears</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {houseStats
                      .filter((house) => house.totalOutstanding > 0)
                      .map((house) => (
                        <tr key={house.id}>
                          <td>{house.number}</td>
                          <td>
                            {house.residenceStatus === 'rented' && house.tenant
                              ? house.tenant
                              : house.owner}
                          </td>
                          <td>{rupiah.format(house.balance)}</td>
                          <td>{rupiah.format(house.arrearsBalance)}</td>
                          <td>{rupiah.format(house.totalOutstanding)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </section>
      )}

      {activeTab === 'collection' && (
        <section className="page-layer">
          <section className="workspace">
            <div className="panel house-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Collection board</p>
                  <h2>Houses</h2>
                </div>
                <div className="search-box">
                  <Search size={16} />
                  <input
                    aria-label="Search house or owner"
                    placeholder="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>

              <div className="house-grid">
                {filteredHouses.map((house) => (
                  <button
                    className={`house-button ${house.paid ? 'paid' : 'due'} ${
                      selectedHouseId === house.id ? 'selected' : ''
                    }`}
                    key={house.id}
                    onClick={() => selectHouse(house.id)}
                    type="button"
                  >
                    <span className="house-number">{house.number}</span>
                    <span className="owner-name">
                      {house.residenceStatus === 'rented' && house.tenant
                        ? house.tenant
                        : house.owner}
                    </span>
                    <span className="occupant-chip">
                      {residenceLabel[house.residenceStatus]}
                    </span>
                    <span className="house-status">
                      {house.paid ? <Check size={14} /> : <ReceiptText size={14} />}
                      {house.paid ? 'Paid' : rupiah.format(house.totalOutstanding)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="panel payment-panel">
              <div className="selected-house">
                <div className="house-avatar">
                  <Home size={24} />
                </div>
                <div>
                  <p className="eyebrow">Selected house</p>
                  <h2>
                    {selectedHouse.number} - {selectedHouse.owner}
                  </h2>
                  <p>
                    {residenceLabel[selectedHouse.residenceStatus]} bill:{' '}
                    {rupiah.format(selectedStats.expected)}
                  </p>
                  {selectedHouse.residenceStatus === 'rented' && (
                    <p>
                      Tenant: {selectedHouse.tenant || 'Not filled'} · Since:{' '}
                      {selectedHouse.rentalStartDate || 'Not filled'}
                    </p>
                  )}
                </div>
              </div>

              {canEdit ? (
              <form className="form-stack" onSubmit={savePayment}>
                <div className="payment-period">
                  <span>Payment period</span>
                  <strong>{activeMonth}</strong>
                </div>
                <div className="split-fields">
                  <label>
                    Mandatory
                    <input
                      min="0"
                      step="1000"
                      type="number"
                      value={paymentForm.mandatoryAmount}
                      onChange={(event) =>
                        setPaymentForm({
                          ...paymentForm,
                          mandatoryAmount: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Previous unpaid
                    <input
                      min="0"
                      step="1000"
                      type="number"
                      value={paymentForm.arrearsAmount}
                      onChange={(event) =>
                        setPaymentForm({
                          ...paymentForm,
                          arrearsAmount: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="split-fields">
                  <label>
                    Extra
                    <input
                      min="0"
                      step="1000"
                      type="number"
                      value={paymentForm.extraAmount}
                      onChange={(event) =>
                        setPaymentForm({
                          ...paymentForm,
                          extraAmount: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Extra type
                    <select
                      value={paymentForm.extraType}
                      onChange={(event) =>
                        setPaymentForm({
                          ...paymentForm,
                          extraType: event.target.value,
                        })
                      }
                    >
                      <option>None</option>
                      <option>Penalty</option>
                      <option>Charity</option>
                      <option>Other</option>
                    </select>
                  </label>
                  <label>
                    Method
                    <select
                      value={paymentForm.method}
                      onChange={(event) =>
                        setPaymentForm({ ...paymentForm, method: event.target.value })
                      }
                    >
                      <option>Cash</option>
                      <option>Transfer</option>
                      <option>QRIS</option>
                      <option>Other</option>
                    </select>
                  </label>
                </div>
                <label>
                  Notes
                  <input
                    placeholder="Optional"
                    value={paymentForm.notes}
                    onChange={(event) =>
                      setPaymentForm({ ...paymentForm, notes: event.target.value })
                    }
                  />
                </label>
                <button className="primary-action" type="submit">
                  <Plus size={18} />
                  Save payment
                </button>
              </form>
              ) : (
                <div className="read-only-note">
                  <LogIn size={18} />
                  <span>Public view. Admin login is required to record payments.</span>
                </div>
              )}

              <div className="history-block">
                <h3>Recent payments</h3>
                {selectedHistory.length ? (
                  selectedHistory.map((payment) => (
                    <div className="history-row" key={payment.id}>
                      <span>{payment.month}</span>
                      <strong>
                        {rupiah.format(
                          payment.mandatoryAmount +
                            (payment.arrearsAmount ?? 0) +
                            payment.extraAmount,
                        )}
                      </strong>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">No payments recorded yet.</p>
                )}
              </div>
              <button className="secondary-action full-width" onClick={exportPayments} type="button">
                <Download size={18} />
                Payments
              </button>
            </aside>
          </section>

          {canEdit && (
          <section className="panel owner-editor collection-setup">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Setup</p>
                <h3>House data</h3>
              </div>
              <Settings size={20} />
            </div>
            <div className="owner-list">
              {data.houses.map((house) => (
                <div className="owner-row" key={house.id}>
                  <span>{house.number}</span>
                  <input
                    aria-label={`${house.number} owner`}
                    value={house.owner}
                    onBlur={() => void persistHouse(house.id)}
                    onChange={(event) =>
                      updateHouse(house.id, { owner: event.target.value })
                    }
                  />
                  <select
                    aria-label={`${house.number} residence status`}
                    value={house.residenceStatus}
                    onChange={(event) =>
                      updateHouse(house.id, {
                        residenceStatus: event.target.value as ResidenceStatus,
                      })
                    }
                    onBlur={() => void persistHouse(house.id)}
                  >
                    <option value="owner_occupied">Owner</option>
                    <option value="rented">Rented</option>
                    <option value="empty">Empty</option>
                  </select>
                  <input
                    aria-label={`${house.number} tenant`}
                    placeholder="Tenant"
                    value={house.tenant}
                    onBlur={() => void persistHouse(house.id)}
                    onChange={(event) =>
                      updateHouse(house.id, { tenant: event.target.value })
                    }
                  />
                  <input
                    aria-label={`${house.number} rental start`}
                    type="date"
                    value={house.rentalStartDate}
                    onBlur={() => void persistHouse(house.id)}
                    onChange={(event) =>
                      updateHouse(house.id, { rentalStartDate: event.target.value })
                    }
                  />
                  <input
                    aria-label={`${house.number} opening arrears`}
                    min="0"
                    placeholder="Arrears"
                    step="1000"
                    type="number"
                    value={house.openingArrears}
                    onBlur={() => void persistHouse(house.id)}
                    onChange={(event) =>
                      updateHouse(house.id, {
                        openingArrears: Number(event.target.value || 0),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </section>
          )}
        </section>
      )}

      {activeTab === 'expenses' && (
        <section className="page-layer">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Money out</p>
                <h2>Expenses</h2>
              </div>
              <button className="secondary-action" onClick={exportExpenses} type="button">
                <Download size={18} />
                Expenses
              </button>
            </div>
            {canEdit && (
            <form className="expense-form" onSubmit={saveExpense}>
              <input
                aria-label="Expense date"
                type="date"
                value={expenseForm.date}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, date: event.target.value })
                }
              />
              <select
                aria-label="Expense category"
                value={expenseForm.category}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, category: event.target.value })
                }
              >
                <option>Security</option>
                <option>Cleaning</option>
                <option>Maintenance</option>
                <option>Administration</option>
                <option>Other</option>
              </select>
              <input
                aria-label="Expense amount"
                min="0"
                placeholder="Amount"
                step="1000"
                type="number"
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, amount: event.target.value })
                }
              />
              <input
                aria-label="Expense description"
                placeholder="Description"
                value={expenseForm.description}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, description: event.target.value })
                }
              />
              <button className="icon-action" title="Save expense" type="submit">
                <Plus size={18} />
              </button>
            </form>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {monthExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.date}</td>
                      <td>{expense.category}</td>
                      <td>{expense.description || '-'}</td>
                      <td>{rupiah.format(expense.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {showLogin && (
        <div className="modal-backdrop" role="presentation">
          <section className="login-dialog" role="dialog" aria-modal="true" aria-label="Admin login">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Private administration</p>
                <h2>Admin login</h2>
              </div>
              <button
                className="dialog-close"
                aria-label="Close login"
                onClick={() => setShowLogin(false)}
                type="button"
              >
                &times;
              </button>
            </div>
            <form className="form-stack" onSubmit={signIn}>
              <label>
                Email
                <input
                  autoComplete="email"
                  type="email"
                  required
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm({ ...loginForm, email: event.target.value })
                  }
                />
              </label>
              <label>
                Password
                <input
                  autoComplete="current-password"
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm({ ...loginForm, password: event.target.value })
                  }
                />
              </label>
              <button className="primary-action" type="submit">
                <LogIn size={18} />
                Sign in
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
