import { publicProcedure, t } from '../../trpc'
import { listProductsInputSchema, productSlugInputSchema } from '../../schemas'

export const catalogRouter = t.router({
  listProducts: publicProcedure.input(listProductsInputSchema.optional()).query(async ({ ctx, input }) => {
    const result = await ctx.services.catalog.listProducts({
      ...input,
    })

    return {
      products: result.products,
      count: result.count,
    }
  }),

  getProductBySlug: publicProcedure.input(productSlugInputSchema).query(async ({ ctx, input }) => {
    const product = await ctx.services.catalog.getProductBySlug(input.slug)
    return { product }
  }),

  listBrands: publicProcedure.query(async ({ ctx }) => {
    const brands = await ctx.services.catalog.listBrands()
    return { brands }
  }),

  listCategories: publicProcedure.query(async ({ ctx }) => {
    const categories = await ctx.services.catalog.listCategories()
    return { categories }
  }),
})
