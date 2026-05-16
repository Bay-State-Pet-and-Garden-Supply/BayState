-- ---------------------------------------------------------------------
-- Services, Site Settings, and Pages
-- ---------------------------------------------------------------------

INSERT INTO services (id, name, slug, description, price, unit, is_active) VALUES
('11111111-1111-1111-1111-111111111111', 'Propane Refill', 'propane-refill', 'Safe and professional propane tank refilling.', 19.99, 'per tank', true),
('22222222-2222-2222-2222-222222222222', 'Knife Sharpening', 'knife-sharpening', 'Expert sharpening for all your garden tools.', 5.00, 'per blade', true),
('33333333-3333-3333-3333-333333333333', 'Soil Testing', 'soil-testing', 'Comprehensive analysis of your garden soil.', 25.00, 'per sample', true),
('44444444-4444-4444-4444-444444444444', 'Delivery', 'delivery', 'Local delivery service for bulky items.', 35.00, 'per order', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO site_settings (key, value) VALUES
('store_hours', '{"monday": "8am-6pm", "tuesday": "8am-6pm", "wednesday": "8am-6pm", "thursday": "8am-6pm", "friday": "8am-7pm", "saturday": "8am-5pm", "sunday": "9am-4pm"}'::jsonb),
('announcement_banner', '{"text": "Spring Sale! 20% off all garden tools", "enabled": true}'::jsonb),
('contact_info', '{"phone": "(555) 123-4567", "email": "info@baystate.local", "address": "123 Main St, Anytown, USA"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
