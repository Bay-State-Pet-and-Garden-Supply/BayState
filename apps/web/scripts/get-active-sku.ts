import { createClient } from "@supabase/supabase-js";
const supabase = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY || "");

async function main() {
  const { data: products, error } = await supabase
    .from("products_ingestion")
    .select("*")
    .limit(1);
  
  if (error) {
    console.error("Error fetching products:", error);
    return;
  }
  
  console.log("Single active product object key structure:");
  if (products && products.length > 0) {
    console.log(JSON.stringify(products[0], null, 2));
  } else {
    console.log("No products found in products_ingestion");
  }
}
main();
