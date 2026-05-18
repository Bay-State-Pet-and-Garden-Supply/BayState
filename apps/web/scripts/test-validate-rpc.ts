import { createClient } from "@supabase/supabase-js";
const supabase = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY || "");

async function main() {
  const { data, error } = await supabase.rpc("validate_runner_api_key", {
    api_key: "bsr_local_dev_key"
  });
  console.log("RPC result:", { data, error });

  const { data: dbKeys, error: dbError } = await supabase.from("runner_api_keys").select("*");
  console.log("DB Keys in runner_api_keys:", dbKeys, "Error:", dbError);
}
main();
