const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function findRealNodeExecutable() {
  const candidates = [];

  if (process.platform === "win32") {
    const programFiles = unique([process.env.ProgramFiles, process.env["ProgramW6432"]]);
    for (const base of programFiles) {
      candidates.push(path.join(base, "nodejs", "node.exe"));
    }

    const whereResult = spawnSync("where.exe", ["node.exe"], { encoding: "utf8" });
    if (whereResult.status === 0) {
      candidates.push(...whereResult.stdout.split(/\r?\n/));
    }
  } else {
    const home = process.env.HOME;
    if (home) {
      candidates.push(path.join(home, ".nvm", "versions", "node", "v24.12.0", "bin", "node"));
    }

    const whichResult = spawnSync("which", ["node"], { encoding: "utf8" });
    if (whichResult.status === 0) {
      candidates.push(...whichResult.stdout.split(/\r?\n/));
    }
  }

  return unique(candidates).find((candidate) => {
    if (!candidate || !fs.existsSync(candidate)) {
      return false;
    }

    const normalized = candidate.replace(/\\/g, "/").toLowerCase();
    return !normalized.includes("/bun-node-") && !normalized.endsWith("/bun.exe");
  });
}

const nodeExecutable = findRealNodeExecutable();

if (!nodeExecutable) {
  console.error("Unable to locate a real Node.js executable for Jest.");
  process.exit(1);
}

const jestBin = path.resolve(__dirname, "..", "..", "..", "node_modules", "jest", "bin", "jest.js");
const result = spawnSync(nodeExecutable, [jestBin, ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error.message);
}

process.exit(1);
