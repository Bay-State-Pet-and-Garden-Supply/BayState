import { safeValidateEnrichmentResultV1 } from "./lib/enrichment/validation";

const mockPayload = {
  schema_version: "v1",
  upc: "860012057825",
  source: {
    url: "https://www.amazon.com/360-Pet-Nutrition-Freeze-Dried-Food/dp/B0FH95SKNL",
    domain: "www.amazon.com",
    source_type: "marketplace",
    source_slug: "amazon",
    evidence: "Deterministic extraction matched UPC on approved source"
  },
  status: "success",
  extracted_at: new Date().toISOString(),
  model: "crawl4ai-css",
  mode: "structured",
  requested_extraction_mode: null,
  product: {
    name: "360 Pet Nutrition Freeze-Dried Food",
    brand: "360 Pet Nutrition",
    description: "Good food",
    category: null,
    upc: "860012057825",
    weight: "1.0",
    dimensions: null,
    shipping_weight: null,
    image_urls: ["https://images-na.ssl-images-amazon.com/images/I/71Y86aU1yvL._AC_SL1500_.jpg"],
    ingredients: null,
    features: [],
    pet_type: null,
    life_stage: null,
    pet_size: null,
    food_form: null,
    flavor: null,
    special_diet: [],
    health_feature: [],
    packaging_type: null,
    size: null,
    color: null,
    // Add extra keys that Python model has
    guaranteed_analysis: null,
    npk_ratio: null,
    unit_value: null,
    unit_type: null
  },
  confidence: {
    overall: 0.95,
    fields: {}
  },
  validation: {
    upc_match: true,
    warnings: [],
    missing_required: []
  },
  attempts: [
    {
      mode: "structured",
      status: "success",
      error: null
    }
  ],
  decision: "deterministic_success",
  llm_used: false,
  source_results: [
    {
      sourceSlug: "amazon",
      sourceType: "marketplace",
      confidence: 0.95,
      matchedFields: ["name", "brand", "description", "image_urls", "upc"],
      evidenceUrl: "https://www.amazon.com/360-Pet-Nutrition-Freeze-Dried-Food/dp/B0FH95SKNL",
      product: {
        name: "360 Pet Nutrition Freeze-Dried Food",
        brand: "360 Pet Nutrition",
        description: "Good food",
        category: null,
        upc: "860012057825",
        weight: "1.0",
        dimensions: null,
        shipping_weight: null,
        image_urls: ["https://images-na.ssl-images-amazon.com/images/I/71Y86aU1yvL._AC_SL1500_.jpg"],
        ingredients: null,
        features: [],
        pet_type: null,
        life_stage: null,
        pet_size: null,
        food_form: null,
        flavor: null,
        special_diet: [],
        health_feature: [],
        packaging_type: null,
        size: null,
        color: null,
        guaranteed_analysis: null,
        npk_ratio: null,
        unit_value: null,
        unit_type: null
      }
    }
  ]
};

console.log("Validating payload...");
const validated = safeValidateEnrichmentResultV1(mockPayload);
if (validated) {
  console.log("Validation SUCCESS!");
} else {
  console.log("Validation FAILED!");
}
