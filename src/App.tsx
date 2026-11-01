import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft, Banknote, Building2, CalendarDays, Check, CheckCircle2, CircleAlert,
  Copy, CreditCard, Home, LogIn, LogOut, Plus, ReceiptText, Settings2, ShieldCheck,
  Trash2, Users, WalletCards, X,
} from 'lucide-react'
import './App.css'
import {
  buildBillingAccounts, cashSummary, DEFAULT_EMPTY_FEE, DEFAULT_JOINT_FEE,
  DEFAULT_OCCUPIED_FEE, monthLabel, monthlyFeeForAccount, statementForAccount, tariffForMonth,
} from './domain'
import {
  createRemoteExpense, createRemotePayments, createRemoteTariff, currentUserIsAdmin,
  deleteRemoteExpense, deleteRemotePayment, loadRemoteLedger, updateRemoteHouse,
  updateRemoteSettings,
} from './lib/ledgerRepository'
import { supabase, supabaseConfigured } from './lib/supabase'
import type {
  AdminView, BillingAccount, Expense, House, LedgerData, Payment, PublicView,
  ResidenceStatus, Tariff,
} from './types'

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const currentMonth = today.slice(0, 7)
const pageOpenedLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(now)

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
  houses: seedHouses,
  tariffs: [{ id: 'initial', effectiveDate: '2026-01-01', occupiedFee: DEFAULT_OCCUPIED_FEE, emptyFee: DEFAULT_EMPTY_FEE, notes: 'Tarif awal CSJ' }],
  payments: [], expenses: [], openingCashBalance: 0, jointFee0203: DEFAULT_JOINT_FEE,
  bankName: 'Bank Neo Commerce', bankAccountNumber: '5859457243882555', bankAccountHolder: 'Suwondo',
  pendingPaymentMonths: [{ houseId: 4, month: '2026-04', notes: 'Penghuni menyatakan sudah membayar; menunggu bukti pembayaran.' }],
}

const residenceLabel: Record<ResidenceStatus, string> = {
  owner_occupied: 'Dihuni pemilik', rented: 'Disewa', empty: 'Kosong',
}
const expenseLabel: Record<string, string> = {
  Security: 'Keamanan', Cleaning: 'Kebersihan', Maintenance: 'Perawatan',
  Administration: 'Administrasi', Other: 'Lainnya',
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

function App() {
  const [data, setData] = useState<LedgerData>(seedLedger)
  const [activeMonth, setActiveMonth] = useState(currentMonth < '2026-01' ? '2026-01' : currentMonth)
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
  const [recapYear, setRecapYear] = useState(Math.min(2028, Math.max(2026, now.getFullYear())))
  const [copied, setCopied] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: today,
    periods: [{ month: activeMonth, mandatory: '0' }],
    arrears: '0', extra: '0', extraType: 'Tidak ada', method: 'Transfer', notes: '',
  })
  const [expenseForm, setExpenseForm] = useState({ date: today, category: 'Security', amount: '', description: '' })
  const [settingsForm, setSettingsForm] = useState({ openingCashBalance: '0', jointFee0203: String(DEFAULT_JOINT_FEE), bankName: '', bankAccountNumber: '', bankAccountHolder: '' })
  const [tariffForm, setTariffForm] = useState({ effectiveDate: `${activeMonth}-01`, occupiedFee: String(DEFAULT_OCCUPIED_FEE), emptyFee: String(DEFAULT_EMPTY_FEE), notes: '' })
  const [houseQuery, setHouseQuery] = useState('')

  const loadData = async () => {
    setLoading(true); setError('')
    try {
      const ledger = supabaseConfigured ? await loadRemoteLedger() : JSON.parse(localStorage.getItem('csj-ledger-v2') || 'null') ?? seedLedger
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
  const cash = useMemo(() => cashSummary(data, activeMonth), [data, activeMonth])
  const activeTariff = useMemo(() => tariffForMonth(data.tariffs, activeMonth), [data.tariffs, activeMonth])
  const monthExpenses = data.expenses.filter((expense) => expense.date.startsWith(activeMonth))
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
      isPending: Boolean(pendingReview), pendingNotes: pendingReview?.notes ?? '',
      isPartial: paid > 0 && outstanding > 0,
      isFuture: month > currentMonth && !isPaid,
    }
  }), [data, recapYear, selected])
  const currentRecapStatement = useMemo(
    () => statementForAccount(selected, data, currentMonth),
    [data, selected],
  )

  const outstandingForPeriod = (account: BillingAccount, month: string) => {
    const due = monthlyFeeForAccount(account, data.houses, data.tariffs, data.jointFee0203, month)
    const paid = data.payments
      .filter((payment) => account.houseIds.includes(payment.houseId) && payment.month === month)
      .reduce((sum, payment) => sum + payment.mandatoryAmount, 0)
    return Math.max(due - paid, 0)
  }

  const updatePaymentPeriod = (index: number, month: string) => {
    const mandatory = String(outstandingForPeriod(selected, month))
    setPaymentForm((form) => ({
      ...form,
      periods: form.periods.map((period, periodIndex) => periodIndex === index ? { month, mandatory } : period),
    }))
  }

  const addPaymentPeriod = () => {
    const month = nextMonthValue(paymentForm.periods.at(-1)?.month ?? activeMonth)
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
    setPaymentForm((form) => ({
      ...form,
      periods: [{ month: activeMonth, mandatory: String(statement.currentBalance) }],
      arrears: String(statement.arrearsBalance),
    }))
  }

  const openPublicRecap = (account: BillingAccount) => {
    setSelectedAccountId(account.id)
    setRecapYear(Math.min(2028, Math.max(2026, now.getFullYear())))
    setShowRecap(true)
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
    const periodMonths = paymentForm.periods.map((period) => period.month)
    if (new Set(periodMonths).size !== periodMonths.length) { setError('Setiap periode pembayaran harus berbeda.'); return }
    if (!paymentForm.paymentDate) { setError('Tanggal pembayaran wajib dipilih.'); return }
    const arrearsAmount = Number(paymentForm.arrears)
    const extraAmount = Number(paymentForm.extra)
    const paidPeriods = paymentForm.periods
      .map((period) => ({ month: period.month, mandatoryAmount: Number(period.mandatory) }))
      .filter((period) => period.mandatoryAmount > 0)
    const recordedPeriods = paidPeriods.length ? paidPeriods : [{ month: paymentForm.periods[0].month, mandatoryAmount: 0 }]
    if (paidPeriods.reduce((sum, period) => sum + period.mandatoryAmount, 0) + arrearsAmount + extraAmount <= 0) { setError('Jumlah pembayaran harus lebih dari nol.'); return }
    const payments: Payment[] = recordedPeriods.map((period, index) => ({
      id: crypto.randomUUID(), houseId: selected.houseIds[0], month: period.month,
      paymentDate: paymentForm.paymentDate, mandatoryAmount: period.mandatoryAmount,
      arrearsAmount: index === 0 ? arrearsAmount : 0,
      extraAmount: index === 0 ? extraAmount : 0,
      extraType: paymentForm.extraType, method: paymentForm.method, notes: paymentForm.notes,
    }))
    try {
      if (supabaseConfigured) await createRemotePayments(payments)
      setData((current) => ({ ...current, payments: [...payments, ...current.payments] }))
      setPaymentForm({ paymentDate: today, periods: [{ month: activeMonth, mandatory: '0' }], arrears: '0', extra: '0', extraType: 'Tidak ada', method: 'Transfer', notes: '' })
      flash(`Pembayaran ${selected.code} untuk ${payments.length} periode berhasil dicatat.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pembayaran gagal disimpan.') }
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
    const expense: Expense = { id: crypto.randomUUID(), date: expenseForm.date, category: expenseForm.category, amount: Number(expenseForm.amount), description: expenseForm.description }
    if (expense.amount <= 0) { setError('Jumlah pengeluaran harus lebih dari nol.'); return }
    try {
      if (supabaseConfigured) await createRemoteExpense(expense)
      setData((current) => ({ ...current, expenses: [expense, ...current.expenses] }))
      setExpenseForm({ date: today, category: 'Security', amount: '', description: '' }); flash('Pengeluaran berhasil dicatat.')
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

  const patchHouse = (id: number, patch: Partial<House>) => setData((current) => ({ ...current, houses: current.houses.map((house) => house.id === id ? { ...house, ...patch } : house) }))
  const persistHouse = async (house: House) => {
    try { if (supabaseConfigured) await updateRemoteHouse(house); flash(`${house.number} diperbarui.`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Data rumah gagal disimpan.') }
  }

  const setOpeningArrears = (account: BillingAccount, value: number) => {
    setData((current) => ({
      ...current,
      houses: current.houses.map((house) => account.houseIds.includes(house.id)
        ? { ...house, openingArrears: house.id === account.houseIds[0] ? value : 0 }
        : house),
    }))
  }

  const saveOpeningArrears = async (account: BillingAccount) => {
    try {
      const affectedHouses = data.houses.filter((house) => account.houseIds.includes(house.id))
      if (supabaseConfigured) await Promise.all(affectedHouses.map(updateRemoteHouse))
      flash(`Tagihan lama ${account.code} berhasil disimpan.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tagihan lama gagal disimpan.')
    }
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
  const paymentPeriodTotal = paymentForm.periods.reduce((sum, period) => sum + Number(period.mandatory || 0), 0)

  if (loading) return <main className="loading-screen"><div className="brand-mark">CSJ</div><p>Menyiapkan laporan kas warga…</p></main>

  return <main className="app-shell">
    <header className="site-header">
      <div className="brand"><div className="brand-mark">CSJ</div><div><span>Transparansi kas warga</span><h1>Monitoring Iuran Warga CSJ</h1></div></div>
      <div className="header-actions">
        <label className="month-control"><CalendarDays size={17} /><span>Periode</span><input type="month" min="2026-01" value={activeMonth} onChange={(event) => setActiveMonth(event.target.value)} /></label>
        {canEdit ? <button className="admin-button" onClick={() => setMode(mode === 'admin' ? 'public' : 'admin')} type="button"><ShieldCheck size={18} />{mode === 'admin' ? 'Lihat halaman warga' : 'Buka admin'}</button> : <button className="admin-button" onClick={() => setShowLogin(true)} type="button"><LogIn size={18} />Login Admin</button>}
      </div>
    </header>

    {notice && <div className="notice"><CheckCircle2 size={18} />{notice}</div>}
    {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Tutup"><X size={17} /></button></div>}

    {mode === 'public' ? <>
      <nav className="public-nav" aria-label="Navigasi warga">
        <button className={publicView === 'overview' ? 'active' : ''} onClick={() => setPublicView('overview')}><Home size={18} />Ringkasan</button>
        <button className={publicView === 'dues' ? 'active' : ''} onClick={() => setPublicView('dues')}><ReceiptText size={18} />Status Iuran</button>
        <button className={publicView === 'expenses' ? 'active' : ''} onClick={() => setPublicView('expenses')}><WalletCards size={18} />Pengeluaran</button>
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
          <div className="panel-title"><div><span>Status pembayaran</span><h3>Pilih akun rumah</h3></div><button className="text-button" onClick={() => setPublicView('dues')}>Lihat lengkap →</button></div>
          <StatusGrid accounts={statements} selectedId={selected.id} onSelect={openPublicRecap} />
          <div className="selected-summary"><div><span>{selected.code}</span><h3>{selected.residentName}</h3><small>{selected.houseIds.length === 2 ? 'Satu akun gabungan untuk dua rumah' : residenceLabel[selected.residenceStatus]}</small></div><dl><div><dt>Tagihan bulan ini</dt><dd>{rupiah.format(selected.monthlyDue)}</dd></div><div><dt>Sudah dibayar</dt><dd>{rupiah.format(selected.paidThisPeriod)}</dd></div><div><dt>Total belum dibayar</dt><dd>{rupiah.format(selected.totalOutstanding)}</dd></div></dl><span className={`status-badge ${selected.isPaid ? 'paid' : 'due'}`}>{selected.isPaid ? 'Lunas' : 'Belum lunas'}</span></div>
        </section>
      </div>}

      {publicView === 'dues' && <section className="panel page-panel">
        <div className="panel-title"><div><span>Status {monthLabel(activeMonth)}</span><h2>Status Iuran Warga</h2><p>CSJ02 dan CSJ03 tercatat sebagai satu akun pembayaran.</p></div><div className="legend"><span><i className="dot paid" />Lunas</span><span><i className="dot due" />Belum lunas</span></div></div>
        <StatusGrid accounts={statements} selectedId={selected.id} onSelect={openPublicRecap} />
        <div className="selected-summary large"><div><span>{selected.code}</span><h3>{selected.residentName}</h3><small>{selected.houseIds.length === 2 ? 'Akun pembayaran gabungan' : residenceLabel[selected.residenceStatus]}</small></div><dl><div><dt>Tagihan periode</dt><dd>{rupiah.format(selected.monthlyDue)}</dd></div><div><dt>Terbayar periode</dt><dd>{rupiah.format(selected.paidThisPeriod)}</dd></div><div><dt>Tunggakan sebelumnya</dt><dd>{rupiah.format(selected.arrearsBalance)}</dd></div><div><dt>Total kewajiban</dt><dd>{rupiah.format(selected.totalOutstanding)}</dd></div></dl><span className={`status-badge ${selected.isPaid ? 'paid' : 'due'}`}>{selected.isPaid ? 'Lunas' : 'Belum lunas'}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Akun</th><th>Nama</th><th>Tagihan</th><th>Terbayar</th><th>Tunggakan</th><th>Status</th></tr></thead><tbody>{statements.map((item) => <tr key={item.id}><td><strong>{item.code}</strong></td><td>{item.residentName}</td><td>{rupiah.format(item.monthlyDue)}</td><td>{rupiah.format(item.paidThisPeriod)}</td><td>{rupiah.format(item.arrearsBalance)}</td><td><span className={`mini-status ${item.isPaid ? 'paid' : 'due'}`}>{item.isPaid ? 'Lunas' : 'Belum'}</span></td></tr>)}</tbody></table></div>
      </section>}

      {publicView === 'expenses' && <section className="panel page-panel">
        <div className="panel-title"><div><span>Laporan {monthLabel(activeMonth)}</span><h2>Pengeluaran Kas</h2><p>Rincian penggunaan dana lingkungan pada periode yang dipilih.</p></div><div className="total-chip"><span>Total</span><strong>{rupiah.format(cash.monthExpenses)}</strong></div></div>
        <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>Jumlah</th></tr></thead><tbody>{monthExpenses.length ? monthExpenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{expenseLabel[expense.category] ?? expense.category}</td><td>{expense.description || '—'}</td><td><strong>{rupiah.format(expense.amount)}</strong></td></tr>) : <tr><td colSpan={4}><div className="empty-state">Belum ada pengeluaran pada periode ini.</div></td></tr>}</tbody></table></div>
      </section>}
    </> : <section className="admin-layout">
      <aside className="admin-sidebar"><div><span className="section-kicker">Area pengurus</span><h2>Administrasi CSJ</h2><p>Kelola data kas dengan akses terbatas.</p></div><nav>
        <button className={adminView === 'payments' ? 'active' : ''} onClick={() => setAdminView('payments')}><ReceiptText size={18} />Pembayaran</button>
        <button className={adminView === 'expenses' ? 'active' : ''} onClick={() => setAdminView('expenses')}><WalletCards size={18} />Pengeluaran</button>
        <button className={adminView === 'houses' ? 'active' : ''} onClick={() => setAdminView('houses')}><Building2 size={18} />Data Rumah</button>
        <button className={adminView === 'settings' ? 'active' : ''} onClick={() => setAdminView('settings')}><Settings2 size={18} />Pengaturan</button>
      </nav><div className="sidebar-actions"><button onClick={() => setMode('public')}><ArrowLeft size={17} />Halaman warga</button><button onClick={() => void signOut()}><LogOut size={17} />Keluar admin</button></div></aside>
      <div className="admin-content">
        {adminView === 'payments' && <>
          <div className="admin-heading"><div><span>Pencatatan iuran</span><h2>Pembayaran Warga</h2><p>Pilih akun, periksa kewajiban, lalu catat pembayarannya.</p></div><div className="admin-stat"><span>Periode</span><strong>{monthLabel(activeMonth)}</strong></div></div>
          <div className="admin-two-column"><section className="panel account-picker"><div className="panel-title"><div><span>35 akun pembayaran</span><h3>Pilih akun</h3></div></div><StatusGrid accounts={statements} selectedId={selected.id} onSelect={selectAccount} /></section>
          <section className="panel form-card"><div className="selected-admin"><div className="house-avatar"><Home size={22} /></div><div><span>Akun terpilih</span><h3>{selected.code}</h3><p>{selected.residentName}</p></div><span className={`status-badge ${selected.isPaid ? 'paid' : 'due'}`}>{selected.isPaid ? 'Lunas' : 'Belum'}</span></div>
            <div className="obligation-strip"><div><span>Tagihan berjalan</span><strong>{rupiah.format(selected.currentBalance)}</strong></div><div><span>Tunggakan</span><strong>{rupiah.format(selected.arrearsBalance)}</strong></div></div>
            <form className="form-grid" onSubmit={savePayment}>
              <label>Tanggal bayar<input type="date" required value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} /></label>
              <label>Metode<select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select></label>
              <div className="payment-periods wide">
                <div className="payment-period-heading"><div><strong>Periode pembayaran</strong><span>Pilih bulan dan tahun. Tambahkan baris jika satu transaksi membayar beberapa bulan.</span></div><button className="secondary-action" type="button" onClick={addPaymentPeriod}><Plus size={16} />Tambah periode</button></div>
                {paymentForm.periods.map((period, index) => <div className="payment-period-row" key={`${index}-${period.month}`}>
                  <label>Bulan & tahun<input type="month" min="2026-01" max="2028-12" required value={period.month} onChange={(e) => updatePaymentPeriod(index, e.target.value)} /></label>
                  <label>Iuran periode<input type="number" min="0" step="1000" value={period.mandatory} onChange={(e) => setPaymentForm((form) => ({ ...form, periods: form.periods.map((item, periodIndex) => periodIndex === index ? { ...item, mandatory: e.target.value } : item) }))} /></label>
                  <button aria-label={`Hapus periode ${monthLabel(period.month)}`} className="icon-button danger" disabled={paymentForm.periods.length === 1} onClick={() => removePaymentPeriod(index)} title="Hapus periode" type="button"><Trash2 size={16} /></button>
                </div>)}
                <div className="payment-period-total"><span>Total iuran periode terpilih</span><strong>{rupiah.format(paymentPeriodTotal)}</strong></div>
              </div>
              <label>Bayar tunggakan<input type="number" min="0" step="1000" value={paymentForm.arrears} onChange={(e) => setPaymentForm({ ...paymentForm, arrears: e.target.value })} /></label>
              <label>Tambahan<input type="number" min="0" step="1000" value={paymentForm.extra} onChange={(e) => setPaymentForm({ ...paymentForm, extra: e.target.value })} /></label>
              <label>Jenis tambahan<select value={paymentForm.extraType} onChange={(e) => setPaymentForm({ ...paymentForm, extraType: e.target.value })}><option>Tidak ada</option><option>Denda</option><option>Sumbangan</option><option>Lainnya</option></select></label>
              <label className="wide">Catatan<input placeholder="Opsional" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></label>
              <button className="primary-action wide" type="submit"><Plus size={18} />Simpan pembayaran{paymentForm.periods.length > 1 ? ` (${paymentForm.periods.length} periode)` : ''}</button>
            </form>
          </section></div>
          <section className="panel history-panel"><div className="panel-title"><div><span>Riwayat akun</span><h3>{selected.code}</h3></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Periode</th><th>Iuran</th><th>Tunggakan</th><th>Tambahan</th><th>Metode</th><th /></tr></thead><tbody>{selectedPayments.length ? selectedPayments.map((payment) => <tr key={payment.id}><td>{payment.paymentDate}</td><td>{monthLabel(payment.month)}</td><td>{rupiah.format(payment.mandatoryAmount)}</td><td>{rupiah.format(payment.arrearsAmount)}</td><td>{rupiah.format(payment.extraAmount)}</td><td>{payment.method || '—'}</td><td><button className="icon-button danger" onClick={() => void removePayment(payment)} title="Hapus pembayaran"><Trash2 size={16} /></button></td></tr>) : <tr><td colSpan={7}><div className="empty-state">Belum ada pembayaran untuk akun ini.</div></td></tr>}</tbody></table></div></section>
        </>}

        {adminView === 'expenses' && <><div className="admin-heading"><div><span>Kas keluar</span><h2>Catat Pengeluaran</h2><p>Semua pengeluaran akan langsung muncul pada laporan warga.</p></div></div><section className="panel form-card horizontal"><form className="form-grid expense-entry" onSubmit={saveExpense}><label>Tanggal<input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} /></label><label>Kategori<select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}><option value="Security">Keamanan</option><option value="Cleaning">Kebersihan</option><option value="Maintenance">Perawatan</option><option value="Administration">Administrasi</option><option value="Other">Lainnya</option></select></label><label>Jumlah<input type="number" min="0" step="1000" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></label><label>Keterangan<input placeholder="Contoh: perbaikan lampu" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} /></label><button className="primary-action" type="submit"><Plus size={18} />Simpan</button></form></section><section className="panel history-panel"><div className="panel-title"><div><span>Riwayat</span><h3>Semua Pengeluaran</h3></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>Jumlah</th><th /></tr></thead><tbody>{data.expenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{expenseLabel[expense.category] ?? expense.category}</td><td>{expense.description || '—'}</td><td><strong>{rupiah.format(expense.amount)}</strong></td><td><button className="icon-button danger" onClick={() => void removeExpense(expense)} title="Hapus pengeluaran"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div></section></>}

        {adminView === 'houses' && <>
          <div className="admin-heading"><div><span>Data dasar</span><h2>Rumah dan Penghuni</h2><p>Kelola penghuni serta tagihan yang masih terutang sampai 31 Desember 2025.</p></div><input className="search-input" placeholder="Cari rumah atau nama…" value={houseQuery} onChange={(e) => setHouseQuery(e.target.value)} /></div>
          <section className="panel opening-arrears-panel">
            <div className="panel-title"><div><span>Saldo awal piutang</span><h3>Tagihan s.d. 31 Desember 2025</h3><p>Nilai awal seluruh akun adalah Rp0. Masukkan nominal lama secara manual jika ada.</p></div></div>
            <div className="opening-arrears-grid">{accounts.map((account) => <label key={account.id}><span>{account.code}</span><div><input type="number" min="0" step="1000" value={account.openingArrears} onChange={(e) => setOpeningArrears(account, Number(e.target.value || 0))} /><button className="small-action" type="button" onClick={() => void saveOpeningArrears(account)}>Simpan</button></div></label>)}</div>
          </section>
          <section className="panel house-editor"><div className="table-wrap"><table><thead><tr><th>Rumah</th><th>Pemilik</th><th>Status</th><th>Penghuni/penyewa</th><th>Mulai tagihan</th><th /></tr></thead><tbody>{filteredHouses.map((house) => <tr key={house.id}><td><strong>{house.number}</strong>{house.id === 2 || house.id === 3 ? <small className="joint-note">Akun gabungan</small> : null}</td><td><input value={house.owner} onChange={(e) => patchHouse(house.id, { owner: e.target.value })} /></td><td><select value={house.residenceStatus} onChange={(e) => patchHouse(house.id, { residenceStatus: e.target.value as ResidenceStatus })}><option value="owner_occupied">Dihuni pemilik</option><option value="rented">Disewa</option><option value="empty">Kosong</option></select></td><td><input disabled={house.residenceStatus !== 'rented'} placeholder="Nama penyewa" value={house.tenant} onChange={(e) => patchHouse(house.id, { tenant: e.target.value })} /></td><td><input type="month" min="2026-01" value={house.billingStartMonth} onChange={(e) => patchHouse(house.id, { billingStartMonth: e.target.value })} /></td><td><button className="small-action" onClick={() => void persistHouse(house)}>Simpan</button></td></tr>)}</tbody></table></div></section>
        </>}

        {adminView === 'settings' && <><div className="admin-heading"><div><span>Konfigurasi</span><h2>Pengaturan Kas</h2><p>Kelola rekening pembayaran, saldo awal, dan riwayat tarif.</p></div></div><div className="settings-grid"><section className="panel form-card"><div className="panel-title"><div><span>Informasi publik</span><h3>Rekening dan Saldo Awal</h3></div></div><form className="form-grid" onSubmit={saveSettings}><label>Nama bank<input value={settingsForm.bankName} onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })} /></label><label>Nomor rekening<input value={settingsForm.bankAccountNumber} onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountNumber: e.target.value })} /></label><label>Nama pemilik rekening<input value={settingsForm.bankAccountHolder} onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountHolder: e.target.value })} /></label><label>Saldo awal kas<input type="number" step="1000" value={settingsForm.openingCashBalance} onChange={(e) => setSettingsForm({ ...settingsForm, openingCashBalance: e.target.value })} /></label><label className="wide">Tarif gabungan CSJ02 + CSJ03<input type="number" min="0" step="1000" value={settingsForm.jointFee0203} onChange={(e) => setSettingsForm({ ...settingsForm, jointFee0203: e.target.value })} /></label><button className="primary-action wide" type="submit">Simpan pengaturan</button></form></section><section className="panel form-card"><div className="panel-title"><div><span>Tarif efektif</span><h3>Tambah Riwayat Tarif</h3></div></div><div className="current-tariff"><span>Tarif {monthLabel(activeMonth)}</span><strong>Dihuni {rupiah.format(activeTariff.occupiedFee)} · Kosong {rupiah.format(activeTariff.emptyFee)}</strong></div><form className="form-grid" onSubmit={saveTariff}><label>Berlaku mulai<input type="date" value={tariffForm.effectiveDate} onChange={(e) => setTariffForm({ ...tariffForm, effectiveDate: e.target.value })} /></label><label>Tarif dihuni<input type="number" min="0" step="1000" value={tariffForm.occupiedFee} onChange={(e) => setTariffForm({ ...tariffForm, occupiedFee: e.target.value })} /></label><label>Tarif rumah kosong<input type="number" min="0" step="1000" value={tariffForm.emptyFee} onChange={(e) => setTariffForm({ ...tariffForm, emptyFee: e.target.value })} /></label><label>Catatan<input placeholder="Contoh: keputusan rapat warga" value={tariffForm.notes} onChange={(e) => setTariffForm({ ...tariffForm, notes: e.target.value })} /></label><button className="primary-action wide" type="submit"><Plus size={18} />Tambahkan tarif</button></form><div className="tariff-history">{[...data.tariffs].reverse().map((tariff) => <div key={tariff.id}><span>{tariff.effectiveDate}</span><strong>{rupiah.format(tariff.occupiedFee)} / {rupiah.format(tariff.emptyFee)}</strong></div>)}</div></section></div></>}
      </div>
    </section>}

    <footer><span>Monitoring Iuran Warga CSJ</span><span>Data diperbarui langsung dari Supabase</span></footer>

    {showRecap && <div className="modal-backdrop" role="presentation"><section className="recap-dialog" role="dialog" aria-modal="true" aria-label={`Rekap pembayaran ${selected.code}`}>
      <button className="modal-close" onClick={() => setShowRecap(false)} aria-label="Tutup rekap"><X size={20} /></button>
      <div className="recap-heading"><div><span className="section-kicker">Rekap pembayaran</span><h2>{selected.code}</h2><p>{selected.residentName}{selected.houseIds.length === 2 ? ' · satu akun gabungan' : ''}</p></div><span className={`status-badge ${currentRecapStatement.isPaid ? 'paid' : 'due'}`}>{currentRecapStatement.isPaid ? 'Lunas' : 'Belum lunas'}</span></div>
      <div className="recap-year-tabs" aria-label="Pilih tahun rekap">{[2026, 2027, 2028].map((year) => <button className={recapYear === year ? 'active' : ''} key={year} onClick={() => setRecapYear(year)} type="button">{year}</button>)}</div>
      <div className="cumulative-due"><div><span>Kumulatif belum terbayar</span><small>Sampai halaman dibuka pada {pageOpenedLabel}</small></div><strong>{rupiah.format(currentRecapStatement.totalOutstanding)}</strong></div>
      <div className="prior-arrears"><div><span>Tagihan sampai 31 Desember 2025</span><small>Nilai ini diisi manual oleh pengurus.</small></div><strong>{rupiah.format(selected.openingArrears)}</strong></div>
      <div className="month-recap-grid">{monthlyRecap.map((item) => {
        const state = item.isNotApplicable ? 'not-applicable' : item.isPending ? 'pending' : item.isPaid ? 'paid' : item.isPartial ? 'partial' : item.isFuture ? 'future' : 'due'
        return <article className={state} key={item.month}><div className="month-status-icon">{item.isPending ? <CircleAlert size={18} /> : item.isNotApplicable || item.isFuture ? <CalendarDays size={17} /> : item.isPaid ? <Check size={19} /> : item.isPartial ? <CircleAlert size={18} /> : <X size={19} />}</div><div><strong>{monthLabel(item.month)}</strong><span>{item.isNotApplicable ? 'Belum mulai tagihan' : item.isPending ? 'Menunggu konfirmasi' : item.isPaid ? 'Lunas' : item.isPartial ? 'Dibayar sebagian' : item.isFuture ? 'Belum jatuh tempo' : 'Belum dibayar'}</span></div>{(state === 'due' || state === 'partial') && <div className="month-outstanding"><span>{state === 'partial' ? 'Sisa terutang' : 'Terutang'}</span><strong>{rupiah.format(item.outstanding)}</strong></div>}{state === 'pending' && <div className="month-pending-note"><span>{item.pendingNotes}</span><strong>{rupiah.format(item.outstanding)}</strong></div>}</article>
      })}</div>
      <div className="recap-legend"><span><i className="dot paid" />Hijau: lunas</span><span><i className="dot due" />Merah ✕: belum lunas</span><span><i className="dot partial" />Merah muda: dibayar sebagian</span><span><i className="dot pending" />Kuning: menunggu konfirmasi</span><span><i className="dot future" />Abu-abu: belum jatuh tempo</span></div>
    </section></div>}

    {showLogin && <div className="modal-backdrop" role="presentation"><section className="login-dialog" role="dialog" aria-modal="true" aria-label="Login admin"><button className="modal-close" onClick={() => setShowLogin(false)} aria-label="Tutup"><X size={20} /></button><div className="login-icon"><ShieldCheck size={28} /></div><span className="section-kicker">Akses pengurus</span><h2>Login Admin</h2><p>Masuk untuk mencatat pembayaran, pengeluaran, dan memperbarui data warga.</p><form onSubmit={signIn}><label>Email<input type="email" autoComplete="email" required value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} /></label><label>Kata sandi<input type="password" autoComplete="current-password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /></label><button className="primary-action" type="submit"><LogIn size={18} />Masuk</button></form></section></div>}
  </main>
}

export default App
