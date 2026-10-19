create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_nickname text;
begin
  requested_nickname := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '회원' || substr(replace(new.id::text, '-', ''), 1, 10)
  ), 12);

  insert into public.profiles (id, nickname)
  values (new.id, requested_nickname)
  on conflict do nothing;

  if not found then
    insert into public.profiles (id, nickname)
    values (new.id, '회원' || substr(replace(new.id::text, '-', ''), 1, 10))
    on conflict do nothing;
  end if;

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

insert into public.profiles (id, nickname)
select
  users.id,
  '회원' || substr(replace(users.id::text, '-', ''), 1, 10)
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where profiles.id is null
on conflict do nothing;

insert into public.user_stats (user_id)
select users.id
from auth.users as users
left join public.user_stats as stats on stats.user_id = users.id
where stats.user_id is null
on conflict (user_id) do nothing;
