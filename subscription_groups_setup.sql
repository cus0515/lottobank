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
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text,
  share_weight numeric not null default 1,
  status text not null default 'accepted',
  created_at timestamptz not null default now()
);

create table if not exists public.lotto_group_tickets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lotto_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete cascade,
  lottery_type text not null default 'lotto',
  round_no integer,
  ticket_code text,
  amount bigint not null default 0,
  prize_amount bigint not null default 0,
  memo text,
  created_at timestamptz not null default now()
);

alter table public.lotto_group_members
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists status text not null default 'accepted';

alter table public.lotto_group_tickets
  add column if not exists ticket_id uuid references public.tickets(id) on delete cascade;

create unique index if not exists lotto_group_members_group_user_uidx
  on public.lotto_group_members(group_id, user_id)
  where user_id is not null;

create unique index if not exists lotto_group_tickets_group_ticket_uidx
  on public.lotto_group_tickets(group_id, ticket_id)
  where ticket_id is not null;

create or replace function public.is_lotto_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lotto_groups g
    where g.id = p_group_id and g.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.lotto_group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid()
  );
$$;

alter table public.lotto_groups enable row level security;
alter table public.lotto_group_members enable row level security;
alter table public.lotto_group_tickets enable row level security;

drop policy if exists "group owners manage groups" on public.lotto_groups;
create policy "group owners manage groups"
  on public.lotto_groups for all to authenticated
  using (public.is_lotto_group_member(id))
  with check (owner_id = auth.uid());

drop policy if exists "group owners manage members" on public.lotto_group_members;
create policy "group owners manage members"
  on public.lotto_group_members for all to authenticated
  using (public.is_lotto_group_member(group_id))
  with check (public.is_lotto_group_member(group_id));

drop policy if exists "group owners manage tickets" on public.lotto_group_tickets;
create policy "group owners manage tickets"
  on public.lotto_group_tickets for all to authenticated
  using (public.is_lotto_group_member(group_id))
  with check (public.is_lotto_group_member(group_id)
  and (
    created_by = auth.uid()
    or exists (
      select 1 from public.lotto_groups g
      where g.id = lotto_group_tickets.group_id and g.owner_id = auth.uid()
    )
  ));
