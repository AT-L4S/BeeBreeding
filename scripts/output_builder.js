/**
 * Output Builder
 *
 * Converts intermediate format from all parsers into final JSONC files:
 * - bees.jsonc: All bee species data
 * - mutations.jsonc: All mutation/breeding relationships
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

  // Build mutations.jsonc
  const breedingOutput = buildBreedingPairsJsonc(merged);
  writeJsonc(
    path.join(outputDir, "mutations.jsonc"),
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
  console.log(
    `  - ${breedingOutput.reduce(
      (sum, group) => sum + group.children.length,
      0
    )} mutations (${merged.mutations.length} total parsed)`
  );
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
          // Convert UID to "Mod:Name" format for comb producers
          const modName = bee.mod;
          const beeName = bee.name;
          const beeKey = `${modName}:${beeName}`;
          merged.combs[combId].producers.push({
            bee: beeKey,
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
 * Build bees.jsonc content in the format matching existing data
 * Key format: "Mod:BeeName" (e.g., "Forestry:Forest", "ExtraBees:Blue")
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
    // Convert UID to "Mod:Name" format
    const key = `${bee.mod}:${bee.name}`;

    // Build bee object matching existing format
    const beeData = {
      mod: bee.mod,
      name: bee.name,
      idealTemperature: bee.temperature || "",
      idealHumidity: bee.humidity || "",
      temperatureTolerance: "", // Not available in parsed data
      humidityTolerance: "", // Not available in parsed data
      speed: "", // Not available in parsed data
      lifespan: "", // Not available in parsed data
      fertility: "", // Not available in parsed data
      neverSleeps: false, // Not available in parsed data
      caveDwelling: false, // Not available in parsed data
      tolerantFlyer: false, // Not available in parsed data
    };

    // Add products if present (convert item format and preserve isSpecialty flag)
    if (bee.products && bee.products.length > 0) {
      beeData.products = bee.products.map((p) => {
        const product = {
          item: p.item,
          chance: p.chance,
        };
        // Only include isSpecialty if it's explicitly true (omit for regular products)
        if (p.isSpecialty === true) {
          product.isSpecialty = true;
        }
        return product;
      });
    } else {
      beeData.products = [];
    }

    // Add additional properties from parsed data (as supplementary info)
    if (bee.branch) beeData.branch = bee.branch;
    if (bee.binomial) beeData.binomial = bee.binomial;
    if (bee.dominant !== undefined) beeData.dominant = bee.dominant;
    if (bee.colors) beeData.colors = bee.colors;
    if (bee.hasEffect !== undefined) beeData.hasEffect = bee.hasEffect;
    if (bee.isSecret !== undefined) beeData.isSecret = bee.isSecret;

    output[key] = beeData;
  });

  return output;
}

/**
 * Build mutations.jsonc content in the format matching existing data
 * Format: Array of {parents: [], children: [{species, probability, requirements?}]}
 */
function buildBreedingPairsJsonc(merged) {
  const output = [];
  let skippedMutationsCount = 0;

  // Group mutations by parent pair
  const mutationGroups = new Map();

  // Log first few bee keys to understand the structure
  const beeKeys = Object.keys(merged.bees);
  console.log(`Total bees in merged.bees: ${beeKeys.length}`);
  console.log("Sample bee keys:", beeKeys.slice(0, 5));

  merged.mutations.forEach((mutation) => {
    // Find bees by either their UID or by Mod:Name format
    const findBee = (identifier) => {
      // Check for null/undefined identifier
      if (!identifier) {
        return null;
      }

      // First try direct UID lookup
      if (merged.bees[identifier]) {
        return merged.bees[identifier];
      }

      // Try to convert Mod:Name to UID format for lookup
      if (identifier.includes(":")) {
        const [mod, name] = identifier.split(":");

        // Map mod names to their UID prefixes
        const modPrefixMap = {
          forestry: "forestry",
          extrabees: "extrabees",
          magicbees: "magicbees",
          careerbees: "careerbees",
          meatballcraft: "gendustry", // MeatballCraft uses gendustry prefix
        };

        const modPrefix = modPrefixMap[mod.toLowerCase()] || mod.toLowerCase();

        // Try common UID patterns (preserve case for name in species pattern)
        const patterns = [
          `${modPrefix}.${name.toLowerCase()}`,
          `${modPrefix}.species${name}`, // Preserve case: speciesIndustrious
          `${modPrefix}.species.${name.toLowerCase()}`,
        ];

        // For MagicBees TE/AE bees, also try without underscore and lowercase
        // e.g., MagicBees:TE_Endearing → magicbees.speciesTeendearing
        if (mod.toLowerCase() === "magicbees" && name.includes("_")) {
          const nameWithoutUnderscore = name.replace(/_/g, "");
          // Storage keys are lowercase after first char: speciesTeendearing
          patterns.push(
            `${modPrefix}.species${
              nameWithoutUnderscore.charAt(0) +
              nameWithoutUnderscore.slice(1).toLowerCase()
            }`
          );
        }

        for (const pattern of patterns) {
          if (merged.bees[pattern]) {
            return merged.bees[pattern];
          }
        }

        // If not found, also try with underscore replaced by space
        // e.g., TE_Endearing → Te endearing
        if (name.includes("_")) {
          const nameWithSpace = name
            .split("_")
            .map(
              (part) =>
                part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            )
            .join(" ");

          const spacePatterns = [
            `${modPrefix}.${nameWithSpace.toLowerCase()}`,
            `${modPrefix}.species${nameWithSpace}`,
          ];

          for (const pattern of spacePatterns) {
            if (merged.bees[pattern]) {
              return merged.bees[pattern];
            }
          }
        }
      }

      return null;
    };

    const parent1Bee = findBee(mutation.parent1);
    const parent2Bee = findBee(mutation.parent2);
    const offspringBee = findBee(mutation.offspring);

    if (!parent1Bee || !parent2Bee || !offspringBee) {
      skippedMutationsCount++;
      if (mutation.source) {
        const fullPath = path.resolve(mutation.source.file);
        const missing = [];
        if (!parent1Bee) missing.push(`parent1: ${mutation.parent1}`);
        if (!parent2Bee) missing.push(`parent2: ${mutation.parent2}`);
        if (!offspringBee) missing.push(`offspring: ${mutation.offspring}`);
        console.warn(
          `⚠️  Skipping mutation: ${
            mutation.offspring
          }\n    Missing: ${missing.join(", ")}\n    ${fullPath}:${
            mutation.source.line
          }`
        );
      } else {
        console.warn(
          `⚠️  Skipping mutation: ${mutation.offspring}\n    (no source location)`
        );
      }
      return;
    }

    const parent1 = `${parent1Bee.mod}:${parent1Bee.name}`;
    const parent2 = `${parent2Bee.mod}:${parent2Bee.name}`;
    const offspring = `${offspringBee.mod}:${offspringBee.name}`;

    // Create sorted key for parent pair (so [A,B] and [B,A] are treated the same)
    const parentKey = [parent1, parent2].sort().join("|");

    if (!mutationGroups.has(parentKey)) {
      mutationGroups.set(parentKey, {
        parents: [parent1, parent2].sort(),
        children: [],
      });
    }

    // Add offspring to this parent pair
    const childEntry = {
      species: offspring,
      probability: mutation.chance / 100, // Convert percentage to decimal
    };

    // Add requirements if present
    if (mutation.conditions && Object.keys(mutation.conditions).length > 0) {
      childEntry.requirements = {};

      // Temperature restrictions
      if (mutation.conditions.temperature) {
        childEntry.requirements.temperature = mutation.conditions.temperature;
      }

      // Humidity restrictions
      if (mutation.conditions.humidity) {
        childEntry.requirements.humidity = mutation.conditions.humidity;
      }

      // Biome restrictions
      if (mutation.conditions.biome) {
        childEntry.requirements.biome = mutation.conditions.biome;
      }

      // Date range (seasonal bees)
      if (mutation.conditions.dateRange) {
        childEntry.requirements.dateRange = mutation.conditions.dateRange;
      }

      // Time of day requirement
      if (mutation.conditions.timeOfDay) {
        childEntry.requirements.timeOfDay = mutation.conditions.timeOfDay;
      }

      // Required block
      if (mutation.conditions.requiredBlock) {
        childEntry.requirements.block = mutation.conditions.requiredBlock;
      }

      // Moon phase (MagicBees)
      if (mutation.conditions.moonPhase) {
        childEntry.requirements.moonPhase = mutation.conditions.moonPhase;
      }

      // Moon phase bonus multiplier (MagicBees)
      if (mutation.conditions.moonPhaseBonus) {
        childEntry.requirements.moonPhaseBonus =
          mutation.conditions.moonPhaseBonus;
      }

      // Thaumcraft vis requirement (MagicBees)
      if (mutation.conditions.thaumcraftVis) {
        childEntry.requirements.thaumcraftVis =
          mutation.conditions.thaumcraftVis;
      }

      // Recent explosion requirement (CareerBees)
      if (mutation.conditions.requireExplosion) {
        childEntry.requirements.requireExplosion = true;
      }

      // Player name requirement (ExtraBees easter egg)
      if (mutation.conditions.requirePlayer) {
        childEntry.requirements.requirePlayer =
          mutation.conditions.requirePlayer;
      }

      // Dimension requirement
      if (mutation.conditions.dimension) {
        childEntry.requirements.dimension = mutation.conditions.dimension;
      }

      // Secret mutation flag
      if (mutation.conditions.isSecret) {
        childEntry.isSecret = true;
      }
    }

    mutationGroups.get(parentKey).children.push(childEntry);
  });

  // Log mutation statistics
  console.log(`Successfully processed: ${output.length} mutation groups`);
  console.log(`Skipped mutations: ${skippedMutationsCount}`);

  // Convert map to array and sort
  const sortedGroups = Array.from(mutationGroups.values()).sort((a, b) => {
    // Sort by first parent, then by second parent
    const parent1Compare = a.parents[0].localeCompare(b.parents[0]);
    if (parent1Compare !== 0) return parent1Compare;
    return a.parents[1].localeCompare(b.parents[1]);
  });

  sortedGroups.forEach((group) => {
    // Sort children by species name
    group.children.sort((a, b) => a.species.localeCompare(b.species));
    output.push(group);
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
      producers: comb.producers.sort((a, b) => a.bee.localeCompare(b.bee)),
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
