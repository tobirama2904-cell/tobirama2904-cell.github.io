-- LEGION v19: уведомления (триггеры) + админская рассылка
drop policy if exists n_admin on notifications;
create policy n_admin on notifications for insert with check (legion_is_admin());

create or replace function legion_notif_follow() returns trigger language plpgsql security definer as $$
declare who text;
begin
  select name into who from profiles where id = new.follower_id;
  insert into notifications (user_id, kind, title, body, link)
  values (new.followee_id, 'follow', 'Новый подписчик', coalesce(who, 'Кто-то') || ' подписался на вас', '/users');
  return new;
end $$;
drop trigger if exists trg_notif_follow on follows;
create trigger trg_notif_follow after insert on follows for each row execute function legion_notif_follow();

create or replace function legion_notif_like() returns trigger language plpgsql security definer as $$
declare aid uuid; who text;
begin
  select author_id into aid from posts where id = new.post_id;
  if aid is null or aid = new.user_id then return new; end if;
  select name into who from profiles where id = new.user_id;
  insert into notifications (user_id, kind, title, body, link)
  values (aid, 'like', 'Новый лайк', coalesce(who, 'Кто-то') || ' оценил ваш пост', '/feed');
  return new;
end $$;
drop trigger if exists trg_notif_like on likes;
create trigger trg_notif_like after insert on likes for each row execute function legion_notif_like();

create or replace function legion_notif_msg() returns trigger language plpgsql security definer as $$
declare m record; who text; ttl text;
begin
  select name into who from profiles where id = new.sender_id;
  select title into ttl from conversations where id = new.convo_id;
  for m in select user_id from convo_members where convo_id = new.convo_id and user_id is distinct from new.sender_id loop
    insert into notifications (user_id, kind, title, body, link)
    values (m.user_id, 'message', 'Новое сообщение', coalesce(who, '') || coalesce(': ' || left(new.text, 80), ''), '/messages');
  end loop;
  return new;
end $$;
drop trigger if exists trg_notif_msg on messages;
create trigger trg_notif_msg after insert on messages for each row execute function legion_notif_msg();
