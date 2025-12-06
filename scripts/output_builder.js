/**
 * Output Builder
 *
 * Converts intermediate format from all parsers into final JSONC files:
 * - bees.jsonc: All bee species data
 * - breeding_pairs.jsonc: All mutation/breeding relationships
 * - combs.jsonc: All honeycomb products
 */

const fs = require("fs");
const path = require("path");

/**
 * Build final JSONC files from intermediate format data
 * @param {Array<Object>} intermediateData - Array of intermediate format objects from parsers
 * @param {string} outputDir - Directory to write JSONC files to
 */
function buildOutput(intermediateData, outputDir) {
  console.log("Building output files...");

  // Merge all data from different mods
  const merged = {
    bees: {},
    mutations: [],
    branches: {},
    combs: {},
  };

  intermediateData.forEach((data) => {
    // Merge bees
    Object.assign(merged.bees, data.bees);

    // Merge mutations
    merged.mutations.push(...data.mutations);

    // Merge branches
    Object.assign(merged.branches, data.branches);
  });

  // Extract comb information from bee products
  extractCombs(merged);

  // Build bees.jsonc
  const beesOutput = buildBeesJsonc(merged);
  writeJsonc(
    path.join(outputDir, "bees.jsonc"),
    beesOutput,
    "Bee Species Data"
  );

  // Build breeding_pairs.jsonc
  const breedingOutput = buildBreedingPairsJsonc(merged);
  writeJsonc(
    path.join(outputDir, "breeding_pairs.jsonc"),
    breedingOutput,
    "Breeding Pairs Data"
  );

  // Build combs.jsonc
  const combsOutput = buildCombsJsonc(merged);
  writeJsonc(
    path.join(outputDir, "combs.jsonc"),
    combsOutput,
    "Honeycomb Data"
  );

  console.log("Output files built successfully!");
  console.log(`  - ${Object.keys(merged.bees).length} bees`);
  console.log(`  - ${merged.mutations.length} mutations`);
  console.log(`  - ${Object.keys(merged.combs).length} combs`);
}

/**
 * Extract comb information from bee products
 */
function extractCombs(merged) {
  Object.entries(merged.bees).forEach(([uid, bee]) => {
    if (bee.products && bee.products.length > 0) {
      bee.products.forEach((product) => {
        if (product.item.includes("comb")) {
          const combId = product.item;
          if (!merged.combs[combId]) {
            merged.combs[combId] = {
              id: combId,
              name: formatCombName(combId),
              producers: [],
            };
          }
          merged.combs[combId].producers.push({
            bee: uid,
            chance: product.chance,
          });
        }
      });
    }
  });
}

/**
 * Format comb name from ID
 */
function formatCombName(combId) {
  const parts = combId.split(".");
  const name = parts[parts.length - 1];
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ");
}

/**
 * Build bees.jsonc content
 */
function buildBeesJsonc(merged) {
  const output = {};

  // Sort bees by mod, then by name
  const sortedBees = Object.entries(merged.bees).sort((a, b) => {
    const modCompare = a[1].mod.localeCompare(b[1].mod);
    if (modCompare !== 0) return modCompare;
    return a[1].name.localeCompare(b[1].name);
  });

  sortedBees.forEach(([uid, bee]) => {
    output[uid] = {
      name: bee.name,
      mod: bee.mod,
      branch: bee.branch,
      binomial: bee.binomial,
      dominant: bee.dominant,
      colors: bee.colors,
      climate: {
        temperature: bee.temperature,
        humidity: bee.humidity,
      },
      hasEffect: bee.hasEffect,
      isSecret: bee.isSecret,
    };

    // Add products if present
    if (bee.products && bee.products.length > 0) {
      output[uid].products = bee.products;
    }
  });

  return output;
}

/**
 * Build breeding_pairs.jsonc content
 */
function buildBreedingPairsJsonc(merged) {
  const output = [];

  // Sort mutations by offspring mod, then by offspring name
  const sortedMutations = merged.mutations.sort((a, b) => {
    const aOffspring = merged.bees[a.offspring];
    const bOffspring = merged.bees[b.offspring];

    if (!aOffspring || !bOffspring) return 0;

    const modCompare = aOffspring.mod.localeCompare(bOffspring.mod);
    if (modCompare !== 0) return modCompare;
    return aOffspring.name.localeCompare(bOffspring.name);
  });

  sortedMutations.forEach((mutation) => {
    const entry = {
      parent1: mutation.parent1,
      parent2: mutation.parent2,
      offspring: mutation.offspring,
      chance: mutation.chance,
    };

    // Add conditions if present
    if (mutation.conditions) {
      entry.conditions = mutation.conditions;
    }

    output.push(entry);
  });

  return output;
}

/**
 * Build combs.jsonc content
 */
function buildCombsJsonc(merged) {
  const output = {};

  // Sort combs by ID
  const sortedCombs = Object.entries(merged.combs).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  sortedCombs.forEach(([id, comb]) => {
    output[id] = {
      name: comb.name,
      producers: comb.producers.sort((a, b) =>
        merged.bees[a.bee].name.localeCompare(merged.bees[b.bee].name)
      ),
    };
  });

  return output;
}

/**
 * Write JSONC file with header comment
 */
function writeJsonc(filePath, data, description) {
  const header = `// ${description}\n// Generated from mod source files\n// Do not edit manually - regenerate using scripts/build.js\n\n`;
  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, header + jsonContent);
  console.log(`Wrote ${filePath}`);
}

/**
 * Main export function
 */
function buildOutputFiles(intermediateData, outputDir = "./data") {
  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    buildOutput(intermediateData, outputDir);
    return true;
  } catch (error) {
    console.error(`Error building output files: ${error.message}`);
    throw error;
  }
}

module.exports = { buildOutputFiles };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      "Usage: node output_builder.js <intermediate-json-file1> [intermediate-json-file2] [...] [--output-dir <dir>]"
    );
    console.log("");
    console.log("Example:");
    console.log(
      "  node output_builder.js forestry.json extrabees.json --output-dir ./data"
    );
    process.exit(1);
  }

  // Parse arguments
  let outputDir = "./data";
  const inputFiles = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output-dir" && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else {
      inputFiles.push(args[i]);
    }
  }

  // Load intermediate data
  const intermediateData = inputFiles.map((file) => {
    console.log(`Loading ${file}...`);
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  });

  buildOutputFiles(intermediateData, outputDir);
}
