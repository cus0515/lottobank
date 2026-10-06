-- 토스 사용자 식별자와 기존 Supabase 회원 데이터를 안전하게 연결하는 테이블

create table if not exists public.toss_auth_identities (
  identity_hash text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  auth_email text not null unique,
  last_referrer text not null default 'DEFAULT' check (last_referrer in ('DEFAULT', 'SANDBOX')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unlinked_at timestamptz
);

alter table public.toss_auth_identities enable row level security;

revoke all on table public.toss_auth_identities from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.toss_auth_identities to service_role;

comment on table public.toss_auth_identities is
  '원본 토스 userKey를 저장하지 않고 HMAC 식별자와 Supabase Auth 사용자만 연결합니다.';
