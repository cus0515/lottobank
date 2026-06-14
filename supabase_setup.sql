-- LottoBank Supabase 초기 스키마
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- ── profiles (회원 프로필) ──────────────────────────────
create table if not exists public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  nickname   text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "누구나 프로필 조회 가능" on public.profiles
  for select using (true);

create policy "본인 프로필 생성" on public.profiles
  for insert with check (auth.uid() = id);

create policy "본인 프로필 수정" on public.profiles
  for update using (auth.uid() = id);


-- ── tickets (QR 등록 티켓) ──────────────────────────────
create table if not exists public.tickets (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade,
  qr_url        text unique not null,
  round_no      integer,
  numbers       integer[] not null,
  purchase_date date,
  result        text default 'pending',   -- pending | checked
  prize_rank    integer,                  -- 1~5, null=미당첨
  prize_amount  bigint default 0,
  created_at    timestamptz default now()
);

alter table public.tickets enable row level security;

create policy "본인 티켓만 조회" on public.tickets
  for select using (auth.uid() = user_id);

create policy "본인 티켓 등록" on public.tickets
  for insert with check (auth.uid() = user_id);

create policy "본인 티켓 수정" on public.tickets
  for update using (auth.uid() = user_id);


-- ── user_stats (전적) ───────────────────────────────────
create table if not exists public.user_stats (
  user_id        uuid references auth.users(id) on delete cascade primary key,
  total_tickets  integer default 0,
  total_spent    bigint  default 0,
  total_wins     integer default 0,
  total_prize    bigint  default 0,
  best_rank      integer,
  rank_1_count   integer default 0,
  rank_2_count   integer default 0,
  rank_3_count   integer default 0,
  rank_4_count   integer default 0,
  rank_5_count   integer default 0,
  updated_at     timestamptz default now()
);

alter table public.user_stats enable row level security;

create policy "전적 공개 조회" on public.user_stats
  for select using (true);

create policy "본인 전적 수정" on public.user_stats
  for all using (auth.uid() = user_id);


-- ── 신규 가입 시 profiles 자동 생성 트리거 ──────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
