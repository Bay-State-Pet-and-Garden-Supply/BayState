import { createClient } from "@supabase/supabase-js";
const supabase = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY || "");

async function main() {
  const { error: rErr } = await supabase.from("scraper_runners").upsert({
    name: "your-runner-name",
    status: "online"
  });
  if(rErr) console.error("Runner Error:", rErr);
  else console.log("Runner inserted successfully.");

  const { error: kErr } = await supabase.from("runner_api_keys").upsert({
    runner_name: "your-runner-name",
    key_hash: "00ea90233cb6277be758add4673161cb95615d074c8021fc66a4dabb1eabd7c2",
    key_prefix: "bsr_local_dev",
    description: "Local development key"
  });
  if(kErr) console.error("Key Error:", kErr);
  else console.log("Key inserted successfully.");

  console.log("Done inserting key");
}
main();
