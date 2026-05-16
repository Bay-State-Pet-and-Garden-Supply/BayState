-- Generated Brands from Excel
INSERT INTO brands (id, name, slug) VALUES
('dd094d0f-4c76-5d01-ac5d-4b74e31f3eda', 'Wondercide', 'wondercide'),
('3925bc47-9a11-5932-9612-a4cb904a8cff', 'Catit', 'catit'),
('47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm', 'fromm')
ON CONFLICT (id) DO NOTHING;
