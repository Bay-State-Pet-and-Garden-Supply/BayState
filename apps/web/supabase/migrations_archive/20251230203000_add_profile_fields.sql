alter table profiles 
add column if not exists phone text,
add column if not exists preferences jsonb default '{}'::jsonb;
