import { z } from "zod";
import { withRetry } from "@repo/shared";

const ProductInfoSchema = z.object({
  productName: z.string(),
  ingredients: z.string(),
});

export type ProductInfo = z.infer<typeof ProductInfoSchema>;

const OpenFoodFactsResponseSchema = z.object({
  status: z.number(),
  product: z.object({
    product_name: z.string().optional(),
    ingredients_text: z.string().optional(),
  }).optional(),
});

export async function fetchProductByBarcode(barcode: string): Promise<ProductInfo | null> {
  const validatedBarcode = z.string().min(1).parse(barcode);
  
  return withRetry(async () => {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${validatedBarcode}.json`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`OpenFoodFacts API error: ${response.status}`);
    }

    const data = await response.json();
    const validated = OpenFoodFactsResponseSchema.parse(data);

    if (validated.status === 1 && validated.product) {
      return ProductInfoSchema.parse({
        productName: validated.product.product_name || "Unknown Product",
        ingredients: validated.product.ingredients_text || "No ingredients listed",
      });
    }

    return null;
  });
}
