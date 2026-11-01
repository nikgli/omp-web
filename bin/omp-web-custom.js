#!/usr/bin/env bun
"use strict";

try {
  require("./check-custom-sdk").checkCustomSdk();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

process.env.OMP_WEB_DIST_DIR ||= ".next-custom";
// The upstream updater installs the published omp-web, not this source fork.
process.env.OMP_WEB_DISABLE_SELF_UPDATE = "1";
require("./omp-web.js");
