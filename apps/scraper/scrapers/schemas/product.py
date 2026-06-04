from pydantic import BaseModel, Field

from typing import Optional

class ProductData(BaseModel):
    product_name: str = Field(description="The exact product name")
    brand: str = Field(description="The brand name")
    description: str = Field(description="Full product description")
    size_metrics: str = Field(description="Size, weight, volume, or dimensions")
    images: list[str] = Field(description="List of product image URLs")
    categories: list[str] = Field(description="Product types, categories, or tags")
    ingredients: Optional[str] = Field(default=None, description="The list of ingredients for the product")
    guaranteed_analysis: Optional[str] = Field(default=None, description="Guaranteed analysis (e.g., crude protein, crude fat, crude fiber, moisture)")
    npk_ratio: Optional[str] = Field(default=None, description="The N-P-K fertilizer ratio/analysis, if applicable (e.g., 10-10-10)")
    unit_value: Optional[float] = Field(default=None, description="The numeric quantity/weight value (e.g., 30.0 for a 30 lb bag, 12 for a 12-pack)")
    unit_type: Optional[str] = Field(default=None, description="The unit of measurement (e.g., LB, OZ, KG, CT, GAL, QUART)")
    # Canonical product facets — extracted only when clearly present on the page
    animal_type: Optional[str] = Field(default=None, description="The target animal for the product (e.g., Dog, Cat, Horse, Chicken, Bird)")
    life_stage: Optional[str] = Field(default=None, description="The life stage the product is formulated for (e.g., Puppy, Adult, Senior, All Life Stages)")
    breed_size: Optional[str] = Field(default=None, description="The breed size the product is intended for (e.g., Small Breed, Medium Breed, Large Breed, Giant Breed)")
    food_form: Optional[str] = Field(default=None, description="The physical form of the food (e.g., Dry Food, Wet Food, Canned, Raw, Freeze-Dried, Pellet)")
    flavor: Optional[str] = Field(default=None, description="The primary flavor or protein source description (e.g., Chicken, Salmon, Beef, Turkey)")
    primary_protein: Optional[str] = Field(default=None, description="The primary protein source ingredient (e.g., Chicken, Salmon, Lamb, Duck)")
    diet_type: Optional[str] = Field(default=None, description="The dietary formulation (e.g., Grain-Free, Limited Ingredient, High-Protein, Weight Control)")
    package_count: Optional[str] = Field(default=None, description="The number of individual units in the package (e.g., '24', '12', '6-pack')")
    package_weight: Optional[str] = Field(default=None, description="The total weight of the entire package (e.g., '30 lb', '4 oz', '10 kg')")
    dimensions: Optional[str] = Field(default=None, description="The physical dimensions of the product or package (e.g., '24x18x6 in', '30x30x30 cm')")
    packaging_type: Optional[str] = Field(default=None, description="The type of packaging (e.g., 'Bag', 'Box', 'Can', 'Pouch', 'Jug', 'Bottle', 'Tub')")
    material: Optional[str] = Field(default=None, description="The primary material the product is made from (e.g., 'Plastic', 'Wood', 'Metal', 'Cotton', 'Stainless Steel')")
    color: Optional[str] = Field(default=None, description="The primary color or color pattern of the product (e.g., 'Red', 'Blue', 'Brown', 'Assorted')")
