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


-- ── posts (커뮤니티 게시글) ─────────────────────────────
create table if not exists public.posts (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  nickname   text not null,
  tag        text not null default 'free',   -- free | verify
  title      text not null,
  likes      integer default 0,
  created_at timestamptz default now()
);

alter table public.posts enable row level security;

create policy "게시글 전체 조회" on public.posts
  for select using (true);

create policy "본인 게시글 작성" on public.posts
  for insert with check (auth.uid() = user_id);

create policy "본인 게시글 삭제" on public.posts
  for delete using (auth.uid() = user_id);

-- 좋아요 (중복 방지용 별도 테이블)
create table if not exists public.post_likes (
  post_id  uuid references public.posts(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

create policy "좋아요 전체 조회" on public.post_likes
  for select using (true);

create policy "좋아요 등록" on public.post_likes
  for insert with check (auth.uid() = user_id);

create policy "좋아요 취소" on public.post_likes
  for delete using (auth.uid() = user_id);

-- =====================================================
-- 채팅 메시지 (Realtime)
-- =====================================================
create table if not exists public.chat_messages (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id) on delete cascade,
  nickname       text not null,
  verified_title text,
  message        text not null,
  created_at     timestamptz default now()
);

alter table public.chat_messages enable row level security;

create policy "채팅 전체 조회" on public.chat_messages
  for select using (true);

create policy "로그인 사용자 채팅 전송" on public.chat_messages
  for insert with check (auth.uid() = user_id);

-- Realtime 활성화
alter publication supabase_realtime add table public.chat_messages;
