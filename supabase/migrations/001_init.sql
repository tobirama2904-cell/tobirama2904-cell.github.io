-- LEGION v19: full social + messenger schema. Run in Supabase SQL editor.
-- 1) Run this file. 2) Enable Realtime for: messages, notifications, conversations.
-- 3) Create storage buckets: avatars (public), media (public), voice (private).
-- 4) Auth -> Providers -> enable Email + Google/GitHub (optional, needs your OAuth keys).


-- profiles (1:1 with auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, name text not null default 'Без имени',
  avatar_url text, cover_url text, bio text default '', status text default '',
  role text default 'user' check (role in ('user','moderator','admin')),
  verified boolean default false, is_private boolean default false,
  last_seen timestamptz default now(), created_at timestamptz default now()
);
-- auto-create profile + promote admins
create or replace function legion_new_user() returns trigger language plpgsql security definer as $$
declare admin_list text := coalesce(current_setting('app.admin_emails', true), 'tobirama2904@gmail.com');
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, coalesce(new.email,''), coalesce(split_part(new.email,'@',1),'Без имени'),
    case when lower(coalesce(new.email,'')) = any(string_to_array(lower(admin_list),',')) then 'admin' else 'user' end)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
drop trigger if exists trg_legion_new_user on auth.users;
create trigger trg_legion_new_user after insert on auth.users for each row execute function legion_new_user();

-- posts / comments / likes / reposts
create table if not exists posts (id uuid primary key default gen_random_uuid(), author_id uuid references profiles(id) on delete cascade, text text not null, image_url text, likes int default 0, comments int default 0, reposts int default 0, created_at timestamptz default now());
create table if not exists comments (id uuid primary key default gen_random_uuid(), post_id uuid references posts(id) on delete cascade, author_id uuid references profiles(id) on delete cascade, text text not null, created_at timestamptz default now());
create table if not exists likes (post_id uuid references posts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, created_at timestamptz default now(), primary key (post_id, user_id));
create table if not exists reposts (post_id uuid references posts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, created_at timestamptz default now(), primary key (post_id, user_id));

-- follows / blocks
create table if not exists follows (follower_id uuid references profiles(id) on delete cascade, followee_id uuid references profiles(id) on delete cascade, created_at timestamptz default now(), primary key (follower_id, followee_id));
create table if not exists blocks (user_id uuid references profiles(id) on delete cascade, blocked_id uuid references profiles(id) on delete cascade, created_at timestamptz default now(), primary key (user_id, blocked_id));

-- stories (24h)
create table if not exists stories (id uuid primary key default gen_random_uuid(), author_id uuid references profiles(id) on delete cascade, image_url text, text text default '', created_at timestamptz default now(), expires_at timestamptz default now() + interval '24 hours');

-- notifications
create table if not exists notifications (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, kind text default 'info', title text default '', body text default '', link text, read boolean default false, created_at timestamptz default now());

-- messenger
create table if not exists conversations (id uuid primary key default gen_random_uuid(), kind text default 'dm' check (kind in ('dm','group','channel')), title text default '', avatar_url text, owner_id uuid references profiles(id), created_at timestamptz default now());
create table if not exists convo_members (convo_id uuid references conversations(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, role text default 'member', last_read timestamptz default now(), created_at timestamptz default now(), primary key (convo_id, user_id));
create table if not exists messages (id uuid primary key default gen_random_uuid(), convo_id uuid references conversations(id) on delete cascade, sender_id uuid references profiles(id) on delete set null, kind text default 'text', text text default '', media_url text, reply_to uuid references messages(id) on delete set null, disappear_at timestamptz, created_at timestamptz default now());
create table if not exists reactions (message_id uuid references messages(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, emoji text not null, created_at timestamptz default now(), primary key (message_id, user_id, emoji));

-- AI bots
create table if not exists bots (id uuid primary key default gen_random_uuid(), owner_id uuid references profiles(id) on delete cascade, name text not null, avatar_url text, persona text default '', system text default '', is_public boolean default true, uses int default 0, created_at timestamptz default now());

-- moderation / activity / announcements / ai memory
create table if not exists reports (id uuid primary key default gen_random_uuid(), reporter_id uuid references profiles(id) on delete set null, target_kind text not null, target_id text not null, reason text default '', status text default 'open', created_at timestamptz default now());
create table if not exists activity_log (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete set null, kind text not null, detail text default '', created_at timestamptz default now());
create table if not exists announcements (id uuid primary key default gen_random_uuid(), title text not null, body text default '', created_at timestamptz default now());
create table if not exists ai_memories (id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, kind text not null, key text default '', value text not null, created_at timestamptz default now());

-- helper: is admin?
create or replace function legion_is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- RLS
alter table profiles enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table likes enable row level security;
alter table reposts enable row level security;
alter table follows enable row level security;
alter table blocks enable row level security;
alter table stories enable row level security;
alter table notifications enable row level security;
alter table conversations enable row level security;
alter table convo_members enable row level security;
alter table messages enable row level security;
alter table reactions enable row level security;
alter table bots enable row level security;
alter table reports enable row level security;
alter table activity_log enable row level security;
alter table announcements enable row level security;
alter table ai_memories enable row level security;

-- profiles: read all, update own, admin all
create policy p_read on profiles for select using (true);
create policy p_upd on profiles for update using (auth.uid() = id or legion_is_admin());
-- posts
create policy po_read on posts for select using (true);
create policy po_ins on posts for insert with check (auth.uid() = author_id);
create policy po_del on posts for delete using (auth.uid() = author_id or legion_is_admin());
-- comments
create policy c_read on comments for select using (true);
create policy c_ins on comments for insert with check (auth.uid() = author_id);
create policy c_del on comments for delete using (auth.uid() = author_id or legion_is_admin());
-- likes/reposts/follows/blocks
create policy l_all on likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy l_read on likes for select using (true);
create policy r_all on reposts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy r_read on reposts for select using (true);
create policy f_all on follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
create policy f_read on follows for select using (true);
create policy b_own on blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- stories
create policy s_read on stories for select using (expires_at > now());
create policy s_ins on stories for insert with check (auth.uid() = author_id);
create policy s_del on stories for delete using (auth.uid() = author_id or legion_is_admin());
-- notifications: own only
create policy n_own on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- conversations: members read, anyone create, owner/admin update
create policy cv_read on conversations for select using (exists (select 1 from convo_members m where m.convo_id = id and m.user_id = auth.uid()) or legion_is_admin());
create policy cv_ins on conversations for insert with check (auth.role() = 'authenticated');
create policy cv_upd on conversations for update using (owner_id = auth.uid() or legion_is_admin());
-- members
create policy cm_read on convo_members for select using (user_id = auth.uid() or legion_is_admin() or exists (select 1 from convo_members m2 where m2.convo_id = convo_id and m2.user_id = auth.uid()));
create policy cm_ins on convo_members for insert with check (auth.role() = 'authenticated');
create policy cm_upd on convo_members for update using (user_id = auth.uid() or legion_is_admin());
-- messages: members read/write, own edit, admin all
create policy m_read on messages for select using (exists (select 1 from convo_members m where m.convo_id = convo_id and m.user_id = auth.uid()) or legion_is_admin());
create policy m_ins on messages for insert with check (exists (select 1 from convo_members m where m.convo_id = convo_id and m.user_id = auth.uid()));
create policy m_del on messages for delete using (sender_id = auth.uid() or legion_is_admin());
-- reactions
create policy re_read on reactions for select using (true);
create policy re_ins on reactions for insert with check (auth.uid() = user_id);
create policy re_del on reactions for delete using (auth.uid() = user_id or legion_is_admin());
-- bots
create policy b_read on bots for select using (is_public or owner_id = auth.uid() or legion_is_admin());
create policy b_ins on bots for insert with check (auth.uid() = owner_id);
create policy b_upd on bots for update using (owner_id = auth.uid() or legion_is_admin());
create policy b_del on bots for delete using (owner_id = auth.uid() or legion_is_admin());
-- reports: create any, read own + admin
create policy rp_ins on reports for insert with check (auth.role() = 'authenticated');
create policy rp_read on reports for select using (reporter_id = auth.uid() or legion_is_admin());
create policy rp_upd on reports for update using (legion_is_admin());
-- activity: admin read, anyone insert own
create policy a_ins on activity_log for insert with check (true);
create policy a_read on activity_log for select using (legion_is_admin());
-- announcements: read all, admin write
create policy an_read on announcements for select using (true);
create policy an_w on announcements for all using (legion_is_admin()) with check (legion_is_admin());
-- ai memories: own only (+admin read)
create policy am_own on ai_memories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy am_admin on ai_memories for select using (legion_is_admin());

-- counters
create or replace function legion_bump_post() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'likes' then update posts set likes = likes + (case when tg_op = 'INSERT' then 1 else -1 end) where id = coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'reposts' then update posts set reposts = reposts + (case when tg_op = 'INSERT' then 1 else -1 end) where id = coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'comments' then update posts set comments = comments + (case when tg_op = 'INSERT' then 1 else -1 end) where id = coalesce(new.post_id, old.post_id);
  end if; return null;
end $$;
drop trigger if exists trg_likes on likes; create trigger trg_likes after insert or delete on likes for each row execute function legion_bump_post();
drop trigger if exists trg_reposts on reposts; create trigger trg_reposts after insert or delete on reposts for each row execute function legion_bump_post();
drop trigger if exists trg_comments on comments;
create trigger trg_comments after insert or delete on comments for each row execute function legion_bump_post();

-- storage buckets (run as service role / in dashboard if this fails)
insert into storage.buckets (id, name, public) values ('avatars','avatars', true), ('media','media', true), ('voice','voice', false) on conflict (id) do nothing;
create policy st_pub_read on storage.objects for select using (bucket_id in ('avatars','media'));
create policy st_pub_ins on storage.objects for insert with check (bucket_id in ('avatars','media') and auth.role() = 'authenticated');
create policy st_voice on storage.objects for all using (bucket_id = 'voice' and auth.role() = 'authenticated') with check (bucket_id = 'voice' and auth.role() = 'authenticated');
