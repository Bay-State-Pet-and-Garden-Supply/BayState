'use client'

import { createProduct } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AddProductPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Add New Product</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createProduct} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name</Label>
              <Input id="name" name="name" placeholder="e.g. Chicken Feed" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input 
                id="slug" 
                name="slug" 
                placeholder="e.g. chicken-feed" 
                required 
                aria-describedby="slug-help"
              />
              <p id="slug-help" className="text-sm text-muted-foreground">
                URL-friendly version of the name.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price" name="price" type="number" step="0.01" placeholder="0.00" required />
            </div>
            <Button type="submit">Create Product</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
