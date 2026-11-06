import test from 'node:test'
import assert from 'node:assert/strict'
import { directoryTransition } from '../src/directoryTransitions.ts'

const party = (id, name, start = '2026-01-01') => ({ id, house_id: 1, name, owner_name: 'Owner A', start_date: start, end_date: '', phone: '', kk_path: '', kk_name: '' })
const fixture = (status = 'owner_occupied') => ({
  ledger: { houses: [{ id: 1, owner: 'Owner A', residenceStatus: status, tenant: status === 'rented' ? 'Tenant A' : '', rentalStartDate: '2026-01-01' }],
    houseOccupancies: status === 'empty' ? [] : [{ id: 'stay-a', houseId: 1, occupantName: status === 'rented' ? 'Tenant A' : 'Owner A', occupantRole: status === 'rented' ? 'tenant' : 'owner', startDate: '2026-01-01', endDate: '', notes: '' }], payments: [{ id: 'old-payment' }], openingArrearsItems: [{ id: 'old-debt', debtorName: 'Owner A', originalAmount: 100 }] },
  owners: [party('owner-a', 'Owner A', '')], tenants: status === 'rented' ? [party('tenant-a', 'Tenant A')] : [],
})
const run = (f, kind, record, moveIn, stayStart = '2026-11-01') => directoryTransition(f.ledger, f.owners, f.tenants, kind, record, { moveIn, stayStart }, '2026-11-06')

test('owner replacement closes unknown-start ownership and moves in without adding a house', () => {
  const f = fixture(); const r = run(f, 'owners', party('owner-b', 'Owner B', '2026-11-01'), true)
  assert.equal(r.owners.find(p => p.id === 'owner-a').end_date, '2026-10-31')
  assert.equal(r.ledger.houses.length, 1)
  assert.equal(r.ledger.houses[0].owner, 'Owner B')
  assert.equal(r.ledger.houseOccupancies.find(o => o.id === 'stay-a').endDate, '2026-10-31')
  assert.equal(r.ledger.houseOccupancies.find(o => !o.endDate).occupantName, 'Owner B')
  assert.deepEqual(r.ledger.payments, f.ledger.payments)
  assert.deepEqual(r.ledger.openingArrearsItems, f.ledger.openingArrearsItems)
})
test('sale with tenant staying preserves occupancy and updates tenant owner', () => {
  const f = fixture('rented'); const r = run(f, 'owners', party('owner-b', 'Owner B', '2026-11-01'), false)
  assert.deepEqual(r.ledger.houseOccupancies, f.ledger.houseOccupancies)
  assert.equal(r.ledger.houses[0].tenant, 'Tenant A')
  assert.equal(r.tenants[0].end_date, '')
  assert.equal(r.tenants[0].owner_name, 'Owner B')
})
test('nonresident new owner leaves former owner occupancy in history and house empty', () => {
  const r = run(fixture(), 'owners', party('owner-b', 'Owner B', '2026-11-01'), false)
  assert.equal(r.ledger.houses[0].residenceStatus, 'empty')
  assert.equal(r.ledger.houses[0].vacancyStartDate, '2026-11-01')
  assert.equal(r.ledger.houseOccupancies.filter(o => !o.endDate).length, 0)
})
test('tenant registration uses separate lease and move-in dates and closes former tenancy', () => {
  const r = run(fixture('rented'), 'tenants', party('tenant-b', 'Tenant B', '2026-10-30'), true, '2026-11-02')
  assert.equal(r.tenants.find(p => p.id === 'tenant-a').end_date, '2026-10-29')
  assert.equal(r.ledger.houseOccupancies.find(o => o.id === 'stay-a').endDate, '2026-11-01')
  assert.equal(r.ledger.houseOccupancies.find(o => !o.endDate).startDate, '2026-11-02')
  assert.equal(r.ledger.houses[0].owner, 'Owner A')
})
test('contact edits preserve identity, dates and occupant history', () => {
  const f = fixture(); const r = run(f, 'owners', { ...f.owners[0], phone: '+628123' }, false)
  assert.equal(r.owners[0].phone, '+628123')
  assert.deepEqual(r.ledger.houseOccupancies, f.ledger.houseOccupancies)
  assert.throws(() => run(f, 'owners', { ...f.owners[0], name: 'Other' }, false))
})
test('backdated, future and duplicate replacement attempts leave original state unchanged', () => {
  const f = fixture('rented'); const before = structuredClone(f)
  assert.throws(() => run(f, 'tenants', party('tenant-b', 'Tenant B', '2025-01-01'), true, '2025-01-01'))
  assert.throws(() => run(f, 'tenants', party('tenant-b', 'Tenant B', '2027-01-01'), true, '2027-01-01'))
  assert.throws(() => run(f, 'tenants', party('tenant-b', 'Tenant A', '2026-11-01'), true))
  assert.deepEqual(f, before)
})
