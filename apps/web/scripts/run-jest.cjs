const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function findRealNodeExecutable() {
  const candidates = [process.execPath];

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
      // Look for any NVM installed node versions
      const nvmDir = path.join(home, ".nvm", "versions", "node");
      if (fs.existsSync(nvmDir)) {
        try {
          const versions = fs.readdirSync(nvmDir);
          for (const version of versions) {
            candidates.push(path.join(nvmDir, version, "bin", "node"));
          }
        } catch (e) {
          // Ignore readdir errors
        }
      }
    }

    // Search all node instances in PATH
    const whichResult = spawnSync("which", ["-a", "node"], { encoding: "utf8" });
    if (whichResult.status === 0) {
      candidates.push(...whichResult.stdout.split(/\r?\n/));
    } else {
      // Fallback if which -a is not supported or fails
      const paths = (process.env.PATH || "").split(path.delimiter);
      for (const p of paths) {
        candidates.push(path.join(p, "node"));
      }
    }
  }

  return unique(candidates).find((candidate) => {
    if (!candidate || !fs.existsSync(candidate)) {
      return false;
    }

    try {
      // Basic check to see if it's a real file and not a directory
      const stats = fs.statSync(candidate);
      if (!stats.isFile()) return false;
    } catch (e) {
      return false;
    }

    const normalized = candidate.replace(/\\/g, "/").toLowerCase();
    // Filter out Bun shims and the bun executable itself
    return !normalized.includes("/bun-node-") && 
           !normalized.endsWith("/bun.exe") && 
           !normalized.endsWith("/bun");
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
