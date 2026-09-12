-- ban flag for profiles
alter table profiles add column if not exists banned boolean default false;
