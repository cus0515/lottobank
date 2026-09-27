-- 레이더 추천번호를 서버(GitHub Actions)에서 매주 자동 생성해 저장하는 테이블
-- 기존 방식(localStorage에 "레이더 탭 방문 시"에만 저장)은 방문 안 한 주는 이력에 구멍이 생겼음.
-- 이 테이블은 방문 여부와 무관하게 회차마다 하나만 서버가 생성해 저장하므로 이력이 항상 연속됨.
-- 로그인 없이도 누구나 볼 수 있어야 하므로 SELECT는 공개, INSERT/UPDATE는 service_role(=GitHub Actions)만 가능.

create table if not exists public.radar_picks (
  id bigint generated always as identity primary key,
  lottery_type text not null check (lottery_type in ('lotto', 'pension')),
  round_no int not null,
  games jsonb not null,
  created_at timestamptz not null default now(),
  unique (lottery_type, round_no)
);

create index if not exists radar_picks_type_round_idx
  on public.radar_picks (lottery_type, round_no desc);

alter table public.radar_picks enable row level security;

drop policy if exists "anyone can read radar picks" on public.radar_picks;
create policy "anyone can read radar picks"
  on public.radar_picks for select
  to anon, authenticated
  using (true);

-- INSERT/UPDATE/DELETE 정책을 두지 않음 → service_role(REST 호출 시 service_role 키)만 RLS를 우회해 쓸 수 있음.
grant select on public.radar_picks to anon, authenticated;
