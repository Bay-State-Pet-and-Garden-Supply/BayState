create table if not exists wishlists (
    user_id uuid references auth.users not null,
    product_id uuid references products(id) on delete cascade not null,
    created_at timestamptz default now(),
    primary key (user_id, product_id)
);

alter table wishlists enable row level security;

create policy "Users can view own wishlist" on wishlists
    for select using (auth.uid() = user_id);

create policy "Users can insert own wishlist" on wishlists
    for insert with check (auth.uid() = user_id);

create policy "Users can delete own wishlist" on wishlists
    for delete using (auth.uid() = user_id);
