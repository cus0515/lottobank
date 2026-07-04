-- 기존 회원과 서비스 데이터를 한 번에 삭제하는 초기화 전용 스크립트

begin;

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
delete from public.app_admins;
delete from auth.users;

commit;
