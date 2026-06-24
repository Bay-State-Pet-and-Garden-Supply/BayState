-- Site settings table for campaign controls
create table if not exists site_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Insert default campaign settings
insert into site_settings (key, value) values 
  ('campaign_banner', '{
    "enabled": true,
    "message": "🌱 Spring Garden Sale — Save 20% on all seeds and planters!",
    "link_text": "Shop Now",
    "link_href": "/products?category=garden",
    "variant": "seasonal"
  }'::jsonb)
on conflict (key) do nothing;

-- Trigger to update updated_at
create trigger update_site_settings_updated_at
  before update on site_settings
  for each row
  execute function update_updated_at_column();
