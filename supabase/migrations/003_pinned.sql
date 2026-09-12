-- LEGION v19: закреплённые сообщения
alter table messages add column if not exists pinned boolean default false;
drop policy if exists m_upd on messages;
create policy m_upd on messages for update using (sender_id = auth.uid() or legion_is_admin());
