import { createHash } from "crypto";
const key = "bsr_local_dev_key";
const hash = createHash("sha256").update(key).digest("hex");
console.log("Hash for " + key + " is: " + hash);

