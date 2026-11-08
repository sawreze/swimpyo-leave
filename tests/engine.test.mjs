// 실행: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const E = vm.runInContext('Engine', ctx);

const emp = (hire, extra = {}) => ({ id: 'e', hire_date: hire, opening_balance: null, opening_date: null, ...extra });
const req = (start, days = 1, status = 'approved', kind = 'full', end = start) => ({ id: start + kind, kind, start_date: start, end_date: end, days, status });
const bal = (e, asOf, rs = []) => E.summary(e, rs, asOf).balance;

test('입사 1개월 전날은 0개, 당일은 1개', () => {
  assert.equal(bal(emp('2026-01-15'), '2026-02-14'), 0);
  assert.equal(bal(emp('2026-01-15'), '2026-02-15'), 1);
});
test('입사 첫해에는 매월 1개씩 최대 11개', () => {
  assert.equal(bal(emp('2025-01-15'), '2025-12-15'), 11);
  assert.equal(bal(emp('2025-01-15'), '2026-01-14'), 11);
});
test('입사 1년에 15개 발생, 쓰지 않았으면 11 + 15 중 25개까지만 쌓이고 1개 소멸', () => {
  const s = E.summary(emp('2025-01-15'), [], '2026-01-15');
  assert.equal(s.balance, 25);
  assert.equal(s.lost, 1);
});
test('연도별 발생량: 1년 15, 2년 15, 3년 16, 5년 17, 21년 25, 23년에도 25', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 21, 22, 23, 40].map(E.annualGrant), [15, 15, 16, 16, 17, 17, 18, 25, 25, 25, 25]);
});
test('사용하면 다음 발생 때 상한까지 다시 찬다', () => {
  const e = emp('2024-03-01', { opening_balance: 10, opening_date: '2025-03-02' });
  // 2026-03-01: 입사 2년, 15개 발생 → 10 - 5 + 15 = 20
  assert.equal(bal(e, '2026-03-01', [req('2025-06-02', 5)]), 20);
  assert.equal(bal(e, '2026-03-01'), 25);
});
test('말일 입사자는 없는 날짜를 말일로 보정하고 밀리지 않는다', () => {
  assert.equal(E.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(E.addMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(E.addMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(bal(emp('2026-01-31'), '2026-02-27'), 0);
  assert.equal(bal(emp('2026-01-31'), '2026-02-28'), 1);
});
test('승인 대기와 반려는 잔여에서 빠지지 않고, 대기는 쓸 수 있는 개수에서만 빠진다', () => {
  const e = emp('2026-01-15');
  const rs = [req('2026-06-01', 1, 'pending'), req('2026-06-02', 2, 'rejected', 'full', '2026-06-03'), req('2026-06-04', 0.5, 'approved', 'am')];
  const s = E.summary(e, rs, '2026-06-20');
  assert.equal(s.balance, 5 - 0.5);
  assert.equal(s.pending, 1);
  assert.equal(s.available, 3.5);
});
test('미래 승인 연차는 예정으로 분리된다', () => {
  const s = E.summary(emp('2026-01-15'), [req('2026-08-03', 1)], '2026-06-20');
  assert.equal(s.balance, 5);
  assert.equal(s.planned, 1);
  assert.equal(s.available, 4);
});
test('잔여를 넘는 신청은 막고, 그날까지 발생할 연차로는 허용한다', () => {
  const e = emp('2026-01-15');
  assert.equal(E.check(e, [req('2026-02-16', 1, 'pending')]).ok, true);
  const r = E.check(e, [req('2026-02-16', 2, 'pending', 'full', '2026-02-17')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'short');
  assert.equal(r.short, 1);
  assert.equal(E.check(e, [req('2026-05-15', 2, 'pending', 'full', '2026-05-18')]).ok, true);
});
test('입사 전 날짜와 기존 잔여 입력 전 날짜는 막는다', () => {
  assert.equal(E.check(emp('2026-01-15'), [req('2026-01-10')]).reason, 'before-hire');
  assert.equal(E.check(emp('2020-01-01', { opening_balance: 5, opening_date: '2026-01-01' }), [req('2025-12-01')]).reason, 'before-opening');
});
test('기존 잔여 입력 이전의 발생은 무시하고 이후부터 쌓는다', () => {
  const e = emp('2020-03-01', { opening_balance: 7.5, opening_date: '2026-01-01' });
  assert.equal(bal(e, '2026-02-28'), 7.5);
  assert.equal(bal(e, '2026-03-01'), 7.5 + 17); // 입사 6년: 15 + floor(5/2)
});
test('오전과 오후 반차는 같은 날 함께 가능하지만 겹치는 신청은 막는다', () => {
  const am = req('2026-06-01', 0.5, 'approved', 'am');
  assert.equal(E.conflict([am], { id: 'x', kind: 'pm', start_date: '2026-06-01', end_date: '2026-06-01' }), null);
  assert.ok(E.conflict([am], { id: 'x', kind: 'am', start_date: '2026-06-01', end_date: '2026-06-01' }));
  assert.ok(E.conflict([am], { id: 'x', kind: 'full', start_date: '2026-05-29', end_date: '2026-06-01' }));
  assert.equal(E.conflict([req('2026-06-01', 1, 'rejected')], { id: 'x', kind: 'full', start_date: '2026-06-01', end_date: '2026-06-01' }), null);
});
test('평일 계산은 주말을 뺀다', () => {
  assert.equal(E.weekdays('2026-11-06', '2026-11-09'), 2); // 금 ~ 월
  assert.equal(E.weekdays('2026-11-07', '2026-11-08'), 0); // 토 ~ 일
});
test('다음 발생과 상한 초과 경고', () => {
  const n = E.nextGrant(emp('2025-01-15', { opening_balance: 20, opening_date: '2026-06-01' }), [], '2026-11-06');
  assert.equal(n.date, '2027-01-15');
  assert.equal(n.amount, 15);
  assert.equal(n.lost, 10);
  assert.equal(E.nextGrant(emp('2026-11-01'), [], '2026-11-06').date, '2026-12-01');
  assert.equal(E.nextGrant(emp('2027-03-10'), [], '2026-11-06').date, '2027-04-10');
});
test('연도 집계', () => {
  const e = emp('2024-01-15');
  const s = E.yearStats(e, [req('2026-03-02', 2, 'approved', 'full', '2026-03-03'), req('2026-12-01', 1), req('2026-12-02', 1, 'pending'), req('2026-12-03', 1, 'rejected')], 2026, '2026-11-06');
  assert.equal(s.used, 2);
  assert.equal(s.planned, 1);
  assert.equal(s.pending, 1);
  assert.equal(s.rejected, 1);
});
