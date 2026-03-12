from pydantic import BaseModel, Field

class ProductData(BaseModel):
    product_name: str = Field(description="The exact product name")
    brand: str = Field(description="The brand name")
    description: str = Field(description="Full product description")
    size_metrics: str = Field(description="Size, weight, volume, or dimensions")
    images: list[str] = Field(description="List of product image URLs")
    categories: list[str] = Field(description="Product types, categories, or tags")
