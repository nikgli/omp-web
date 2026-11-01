"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packages = [
  ["pi-agent-core", "agent", "omp-published-agent"],
  ["pi-ai", "ai", "omp-published-ai"],
  ["pi-catalog", "catalog", "omp-published-catalog"],
  ["pi-coding-agent", "coding-agent", "omp-published-coding-agent"],
  ["pi-tui", "tui", "omp-published-tui"],
  ["pi-utils", "utils", "omp-published-utils"],
];

function checkCustomSdk() {
  for (const [name, directory, types] of packages) {
    const linked = path.join(root, "node_modules", "@oh-my-pi", name);
    const source = path.resolve(root, "..", "omp-custom", "packages", directory);
    const declared = path.join(root, "node_modules", types, "package.json");
    let linkedPath, sourcePath, sourcePackage, declarationsPackage;
    try {
      linkedPath = fs.realpathSync(linked);
      sourcePath = fs.realpathSync(source);
      sourcePackage = JSON.parse(fs.readFileSync(path.join(sourcePath, "package.json"), "utf8"));
      declarationsPackage = JSON.parse(fs.readFileSync(declared, "utf8"));
    } catch (error) {
      throw new Error(`Custom OMP dependencies are missing for ${name}. Run bun install in both repositories. ${error.message}`);
    }
    if (linkedPath !== sourcePath || sourcePackage.version !== declarationsPackage.version) {
      throw new Error(`Custom OMP ${name} is not linked to ${source}, or its version ${sourcePackage.version} differs from declarations ${declarationsPackage.version}. Update the matching omp-published-* dependencies and run bun install.`);
    }
  }
}

if (require.main === module) {
  try {
    checkCustomSdk();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { checkCustomSdk };
