-- Forge Protocol SaaS - Phase B 스키마
-- Supabase 대시보드의 SQL Editor 에서 실행하세요. 재실행해도 안전합니다.
--
-- 유저 테이블은 Supabase Auth 의 auth.users 를 그대로 사용합니다.
-- 프로젝트 상태(state)는 usePersistedState.toStatePayload 결과를 JSONB 로 담습니다.
-- (버전 히스토리용 별도 project_states 테이블은 이후 단계에서 분리 예정)

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default '제목 없음',
  state      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx    on public.projects(user_id);
create index if not exists projects_updated_at_idx  on public.projects(updated_at desc);

-- Row Level Security: 유저는 자기 프로젝트만 접근
alter table public.projects enable row level security;

drop policy if exists projects_own_select on public.projects;
drop policy if exists projects_own_insert on public.projects;
drop policy if exists projects_own_update on public.projects;
drop policy if exists projects_own_delete on public.projects;

create policy projects_own_select on public.projects
  for select using (auth.uid() = user_id);

create policy projects_own_insert on public.projects
  for insert with check (auth.uid() = user_id);

create policy projects_own_update on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy projects_own_delete on public.projects
  for delete using (auth.uid() = user_id);

-- ==========================================================================
-- Phase C: 구독 + 사용량
-- ==========================================================================
-- 쓰기는 서버(service_role)만 한다. service_role 은 RLS 를 우회하므로 아래
-- select 정책만 두면 프론트는 자기 데이터를 읽을 수 있고, 위조 쓰기는 막힌다.

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  tier                   text not null default 'free',
  status                 text not null default 'active',
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);

alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_own_select on public.subscriptions;
create policy subscriptions_own_select on public.subscriptions
  for select using (auth.uid() = user_id);
-- insert/update/delete 정책 없음 -> anon/authed 는 쓰기 불가, service_role 만 가능

create table if not exists public.usage_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  model         text,
  tier          text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists usage_events_user_month_idx on public.usage_events(user_id, created_at desc);

alter table public.usage_events enable row level security;
drop policy if exists usage_events_own_select on public.usage_events;
create policy usage_events_own_select on public.usage_events
  for select using (auth.uid() = user_id);
-- insert 정책 없음 -> service_role 만 기록 가능
