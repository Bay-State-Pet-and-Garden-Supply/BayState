-- ---------------------------------------------------------------------
-- Facet Values and Scraping Metadata
-- ---------------------------------------------------------------------

-- Animal Type
INSERT INTO facet_values (facet_definition_id, value, normalized_value, slug) VALUES
((SELECT id FROM facet_definitions WHERE slug = 'animal-type'), 'Dog', 'dog', 'dog'),
((SELECT id FROM facet_definitions WHERE slug = 'animal-type'), 'Cat', 'cat', 'cat'),
((SELECT id FROM facet_definitions WHERE slug = 'animal-type'), 'Bird', 'bird', 'bird')
ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING;

-- Life Stage
INSERT INTO facet_values (facet_definition_id, value, normalized_value, slug) VALUES
((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Adult', 'adult', 'adult'),
((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Puppy', 'puppy', 'puppy'),
((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Senior', 'senior', 'senior'),
((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Kitten', 'kitten', 'kitten')
ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING;

-- Flavor
INSERT INTO facet_values (facet_definition_id, value, normalized_value, slug) VALUES
((SELECT id FROM facet_definitions WHERE slug = 'flavor'), 'Chicken', 'chicken', 'chicken'),
((SELECT id FROM facet_definitions WHERE slug = 'flavor'), 'Beef', 'beef', 'beef'),
((SELECT id FROM facet_definitions WHERE slug = 'flavor'), 'Salmon', 'salmon', 'salmon')
ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING;
