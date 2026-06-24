create table if not exists addresses (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    full_name text not null,
    address_line1 text not null,
    address_line2 text,
    city text not null,
    state text not null,
    zip_code text not null,
    phone text,
    is_default boolean default false,
    created_at timestamptz default now()
);

alter table addresses enable row level security;

create policy "Users can view own addresses" on addresses
    for select using (auth.uid() = user_id);

create policy "Users can insert own addresses" on addresses
    for insert with check (auth.uid() = user_id);

create policy "Users can update own addresses" on addresses
    for update using (auth.uid() = user_id);

create policy "Users can delete own addresses" on addresses
    for delete using (auth.uid() = user_id);

create or replace function handle_default_address() returns trigger as $$
begin
    if new.is_default then
        update addresses set is_default = false 
        where user_id = new.user_id and id <> new.id;
    end if;
    return new;
end;
$$ language plpgsql;

create trigger on_address_change
    before insert or update on addresses
    for each row execute function handle_default_address();
