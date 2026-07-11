-- LottoBank 구독 등급과 로또 모임 관리 기능을 추가하는 스키마

alter table public.profiles
  add column if not exists membership text not null default 'free',
  add column if not exists subscription_tier text,
  add column if not exists plan text,
  add column if not exists is_plus boolean not null default false,
  add column if not exists membership_updated_at timestamptz;

create table if not exists public.lotto_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lotto_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lotto_groups(id) on delete cascade,
  name text not null,
  email text,
  share_weight numeric not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.lotto_group_tickets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lotto_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  lottery_type text not null default 'lotto',
  round_no integer,
  ticket_code text,
  amount bigint not null default 0,
  prize_amount bigint not null default 0,
  memo text,
  created_at timestamptz not null default now()
);

alter table public.lotto_groups enable row level security;
alter table public.lotto_group_members enable row level security;
alter table public.lotto_group_tickets enable row level security;

drop policy if exists "group owners manage groups" on public.lotto_groups;
create policy "group owners manage groups"
  on public.lotto_groups for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "group owners manage members" on public.lotto_group_members;
create policy "group owners manage members"
  on public.lotto_group_members for all to authenticated
  using (exists (
    select 1 from public.lotto_groups g
    where g.id = lotto_group_members.group_id and g.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.lotto_groups g
    where g.id = lotto_group_members.group_id and g.owner_id = auth.uid()
  ));

drop policy if exists "group owners manage tickets" on public.lotto_group_tickets;
create policy "group owners manage tickets"
  on public.lotto_group_tickets for all to authenticated
  using (exists (
    select 1 from public.lotto_groups g
    where g.id = lotto_group_tickets.group_id and g.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.lotto_groups g
    where g.id = lotto_group_tickets.group_id and g.owner_id = auth.uid()
  ));
