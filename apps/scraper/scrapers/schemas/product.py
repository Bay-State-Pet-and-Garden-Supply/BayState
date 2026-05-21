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
