-- 관리자 권한과 서비스 데이터 초기화 기능을 제공하는 운영 스키마

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

create or replace function public.is_app_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins where user_id = target_user_id
  );
$$;

drop policy if exists "admins view app admins" on public.app_admins;
create policy "admins view app admins"
  on public.app_admins for select to authenticated
  using (public.is_app_admin());

create or replace function public.bootstrap_app_admin(target_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_id uuid;
begin
  select id into target_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_id is null then
    raise exception '가입된 이메일을 찾을 수 없습니다.';
  end if;

  insert into public.app_admins (user_id)
  values (target_id)
  on conflict (user_id) do nothing;

  return target_id;
end;
$$;

create or replace function public.admin_set_by_email(target_email text, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_id uuid;
begin
  if not public.is_app_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_id is null then
    raise exception '가입된 이메일을 찾을 수 없습니다.';
  end if;

  if enabled then
    insert into public.app_admins (user_id)
    values (target_id)
    on conflict (user_id) do nothing;
  else
    if target_id = auth.uid() then
      raise exception '현재 로그인한 관리자 자신은 해제할 수 없습니다.';
    end if;
    delete from public.app_admins where user_id = target_id;
  end if;
end;
$$;

create or replace function public.admin_list()
returns table(user_id uuid, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_app_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  return query
  select admin.user_id, users.email::text, admin.created_at
  from public.app_admins admin
  join auth.users users on users.id = admin.user_id
  order by admin.created_at;
end;
$$;

create or replace function public.admin_reset_app_data(delete_auth_users boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_app_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  delete from public.ticket_game_stores;
  delete from public.saved_number_sets;
  delete from public.post_likes;
  delete from public.comments;
  delete from public.posts;
  delete from public.chat_messages;
  delete from public.activity_feed;
  delete from public.ranking_snapshots;
  delete from public.user_system_titles;
  delete from public.user_daily_visits;
  delete from public.user_badges;
  delete from public.tickets;
  delete from public.user_lottery_stores;
  delete from public.lottery_stores;
  delete from public.user_stats;

  if delete_auth_users then
    delete from auth.users;
  end if;

  return jsonb_build_object(
    'deleted_auth_users', delete_auth_users,
    'completed_at', now()
  );
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','tickets','user_stats','user_badges','activity_feed','chat_messages',
    'posts','comments','post_likes','ranking_snapshots','user_system_titles',
    'user_daily_visits','lottery_stores','user_lottery_stores','saved_number_sets',
    'ticket_game_stores'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists "LottoBank 관리자 전체 권한" on public.%I', table_name);
      execute format('drop policy if exists "app admins manage all" on public.%I', table_name);
      execute format(
        'create policy "app admins manage all" on public.%I for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin())',
        table_name
      );
    end if;
  end loop;
end;
$$;

drop policy if exists "관리자 티켓 전체 조회" on public.tickets;
drop policy if exists "관리자 티켓 수정" on public.tickets;
drop policy if exists "관리자 티켓 삽입" on public.tickets;
drop policy if exists "관리자 티켓 삭제" on public.tickets;
drop policy if exists "관리자 전적 수정" on public.user_stats;
drop policy if exists "관리자 게시글 삭제" on public.posts;
drop policy if exists "관리자 댓글 삭제" on public.comments;
drop policy if exists "admin deletes activity feed" on public.activity_feed;
drop policy if exists "users delete own activity feed" on public.activity_feed;
create policy "users delete own activity feed"
  on public.activity_feed for delete to authenticated
  using (auth.uid() = user_id);

grant select on public.app_admins to authenticated;
grant execute on function public.is_app_admin(uuid) to authenticated;
grant execute on function public.admin_set_by_email(text, boolean) to authenticated;
grant execute on function public.admin_list() to authenticated;
grant execute on function public.admin_reset_app_data(boolean) to authenticated;

revoke all on function public.bootstrap_app_admin(text) from public, anon, authenticated;
grant execute on function public.bootstrap_app_admin(text) to service_role;
