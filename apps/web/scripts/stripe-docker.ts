import { spawn, spawnSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";

const command = process.argv[2];
const home = homedir();
const configDir = join(home, ".config", "stripe");

// Ensure directory exists on host
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

// Docker on Windows prefers forward slashes or escaped backslashes in volume paths
const stripeConfigPath = configDir.replace(/\\/g, "/");

function updateEnv(secret: string) {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  let content = readFileSync(envPath, "utf8");
  const key = "STRIPE_WEBHOOK_SECRET";
  const regex = new RegExp(`^${key}=.*$`, "m");

  if (content.match(regex)) {
    content = content.replace(regex, `${key}=${secret}`);
  } else {
    content += `\n${key}=${secret}`;
  }

  writeFileSync(envPath, content);
  console.log(`✅ Updated ${key} in .env.local`);
}

const dockerArgs = [
  "run",
  "--rm",
  "--name", "baystate-stripe-dev",
  "--label", "com.baystate.service=stripe",
  "--label", "com.baystate.environment=dev",
  "-v",
  `${stripeConfigPath}:/root/.config/stripe`,
];

if (command === "login") {
  const loginArgs = [
    ...dockerArgs,
    "-it",
    "stripe/stripe-cli",
    "login"
  ];
  spawnSync("docker", loginArgs, { stdio: "inherit", shell: true });
} else if (command === "listen") {
  const listenArgs = [
    ...dockerArgs,
    "--add-host=host.docker.internal:host-gateway",
    "stripe/stripe-cli",
    "listen",
    "--forward-to",
    "host.docker.internal:3000/api/payments/webhook"
  ];

  console.log("🚀 Cleaning up old Stripe listener...");
  spawnSync("docker", ["rm", "-f", "baystate-stripe-dev"], { stdio: "ignore", shell: true });

  console.log("🚀 Starting Stripe listener...");
  const child = spawn("docker", listenArgs, { shell: true });

  child.stdout.on("data", (data) => {
    const output = data.toString();
    process.stdout.write(data);

    // Look for the signing secret in the output
    const match = output.match(/whsec_[a-zA-Z0-9]+/);
    if (match) {
      updateEnv(match[0]);
    }
  });

  child.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
} else {
  console.error("Unknown command. Use 'login' or 'listen'.");
  process.exit(1);
}
