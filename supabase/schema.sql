-- 쉼표 연차 관리: Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 한 번 실행합니다. 다시 실행해도 안전합니다.
-- 전제: Authentication > Sign In / Providers > Email 의 "Confirm email" 이 켜져 있어야 합니다.
--       직원 연결을 "확인된 이메일"로 판단하기 때문입니다.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  department text not null default '' check (length(department) <= 40),
  email text not null check (position('@' in email) > 1),
  hire_date date not null,
  opening_balance numeric(4,1) check (opening_balance between 0 and 25 and opening_balance * 2 = trunc(opening_balance * 2)),
  opening_date date,
  created_at timestamptz not null default now(),
  check ((opening_balance is null) = (opening_date is null)),
  check (opening_date is null or opening_date >= hire_date)
);
create unique index if not exists employees_email_key on public.employees (lower(email));

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  kind text not null check (kind in ('full', 'am', 'pm')),
  start_date date not null,
  end_date date not null,
  days numeric(4,1) not null,
  message text check (length(message) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text check (length(decision_note) <= 300),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (kind = 'full' and start_date <= end_date and days >= 1 and days = trunc(days) and days <= end_date - start_date + 1)
    or (kind in ('am', 'pm') and start_date = end_date and days = 0.5)
  )
);
create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id);
create index if not exists leave_requests_dates_idx on public.leave_requests (start_date, end_date);

-- 권한 판단 함수 ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins a where a.user_id = auth.uid()) $$;

-- 이메일 확인이 끝난 계정만 같은 이메일의 직원과 연결합니다.
create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select e.id
  from public.employees e
  join auth.users u on lower(u.email) = lower(e.email)
  where u.id = auth.uid() and u.email_confirmed_at is not null
  limit 1
$$;

-- 달력: 등록된 직원과 관리자만 볼 수 있고, 메시지와 사유는 내보내지 않습니다.
create or replace function public.team_calendar(p_from date, p_to date)
returns table (id uuid, employee_id uuid, name text, department text, kind text, start_date date, end_date date, status text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.employee_id, e.name, e.department, r.kind, r.start_date, r.end_date, r.status
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id
  where r.start_date <= p_to and r.end_date >= p_from
    and (public.is_admin() or public.my_employee_id() is not null)
    and (
      r.status = 'approved'
      or (r.status = 'pending' and (public.is_admin() or r.employee_id = public.my_employee_id()))
    )
$$;

-- 직원이 상태를 직접 정할 수 없게 하고, 처리자와 처리 시각은 서버가 기록합니다.
create or replace function public.leave_requests_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if public.is_admin() then
      if new.status <> 'pending' then
        new.decided_by := auth.uid();
        new.decided_at := now();
      end if;
    else
      new.status := 'pending';
      new.decision_note := null;
      new.decided_by := null;
      new.decided_at := null;
    end if;
  elsif new.status is distinct from old.status then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end
$$;
drop trigger if exists leave_requests_guard on public.leave_requests;
create trigger leave_requests_guard before insert or update on public.leave_requests
for each row execute function public.leave_requests_guard();

-- 행 수준 보안 -------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.employees enable row level security;
alter table public.leave_requests enable row level security;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
  using (public.is_admin() or id = public.my_employee_id());
drop policy if exists employees_admin_insert on public.employees;
create policy employees_admin_insert on public.employees for insert to authenticated
  with check (public.is_admin());
drop policy if exists employees_admin_update on public.employees;
create policy employees_admin_update on public.employees for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists employees_admin_delete on public.employees;
create policy employees_admin_delete on public.employees for delete to authenticated
  using (public.is_admin());

drop policy if exists requests_read on public.leave_requests;
create policy requests_read on public.leave_requests for select to authenticated
  using (public.is_admin() or employee_id = public.my_employee_id());
drop policy if exists requests_insert on public.leave_requests;
create policy requests_insert on public.leave_requests for insert to authenticated
  with check (public.is_admin() or employee_id = public.my_employee_id());
drop policy if exists requests_admin_update on public.leave_requests;
create policy requests_admin_update on public.leave_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists requests_delete on public.leave_requests;
create policy requests_delete on public.leave_requests for delete to authenticated
  using (public.is_admin() or (employee_id = public.my_employee_id() and status = 'pending'));

-- 테이블 권한: 로그인하지 않은 사용자는 아무것도 할 수 없습니다.
revoke all on public.admins, public.employees, public.leave_requests from anon, public;
revoke all on public.admins from authenticated;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.employees, public.leave_requests to authenticated;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_employee_id() from public, anon;
revoke all on function public.team_calendar(date, date) from public, anon;
revoke all on function public.leave_requests_guard() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_employee_id() to authenticated;
grant execute on function public.team_calendar(date, date) to authenticated;

-- 첫 관리자 지정은 README 의 3단계를 따르세요. 관리자 추가는 SQL Editor 에서만 가능합니다.
