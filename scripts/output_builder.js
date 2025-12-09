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

  // Load manual mutations as starting template
  const manualMutationsPath = path.join(__dirname, "manual_mutations.jsonc");
  let manualMutations = [];
  if (fs.existsSync(manualMutationsPath)) {
    console.log("Loading manual mutations template...");
    const content = fs.readFileSync(manualMutationsPath, "utf-8");
    // Remove JSONC comments
    const jsonContent = content
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    manualMutations = JSON.parse(jsonContent);
    console.log(`  Loaded ${manualMutations.length} manual mutation groups`);
  }

  // Extract comb information from bee products
  extractCombs(merged);

  // Build bees.jsonc
  const beesOutput = buildBeesJsonc(merged);
  writeJsonc(
    path.join(outputDir, "bees.jsonc"),
    beesOutput,
    "Bee Species Data"
  );

  // Build mutations.jsonc (starting with manual mutations)
  const breedingOutput = buildBreedingPairsJsonc(merged, manualMutations);
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
  const totalMutations = breedingOutput.reduce(
    (sum, group) => sum + group.children.length,
    0
  );
  console.log(`  - ${totalMutations} mutations`);
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
          // Convert UID to "mod:name" format for comb producers (fully lowercase, no spaces)
          const modName = bee.mod.toLowerCase();
          const beeName = bee.name.toLowerCase().replace(/\s+/g, "");
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
    // Convert UID to "mod:name" format (fully lowercase, no spaces)
    const key = `${bee.mod.toLowerCase()}:${bee.name
      .toLowerCase()
      .replace(/\s+/g, "")}`;

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
 * Format: Array of {parents: [], children: [{species, chance, requirements?}]}
 */
function buildBreedingPairsJsonc(merged, manualMutations = []) {
  // Start with manual mutations as template
  const output = [...manualMutations];
  let skippedMutationsCount = 0;
  let skippedInManualCount = 0;

  // Group mutations by parent pair (start with manual mutations)
  const mutationGroups = new Map();

  // Index manual mutations for quick lookup
  const manualMutationSet = new Set();
  manualMutations.forEach((group) => {
    const parentKey = group.parents.sort().join("|");
    group.children.forEach((child) => {
      const mutationKey = `${parentKey}|${child.species}|${child.chance}`;
      manualMutationSet.add(mutationKey);
    });
    // Add to mutation groups map
    mutationGroups.set(parentKey, {
      parents: [...group.parents],
      children: [...group.children],
    });
  });

  // Debug: Log first few manual mutation keys
  console.log(`Indexed ${manualMutationSet.size} manual mutation entries`);
  const sampleKeys = Array.from(manualMutationSet).slice(0, 3);
  console.log("Sample manual mutation keys:", sampleKeys);

  // Log first few bee keys to understand the structure
  const beeKeys = Object.keys(merged.bees);
  console.log(`Total bees in merged.bees: ${beeKeys.length}`);
  console.log("Sample bee keys:", beeKeys.slice(0, 5));

  merged.mutations.forEach((mutation) => {
    // Find bees by mod:name key (new standardized format)
    const findBee = (identifier) => {
      // Check for null/undefined identifier
      if (!identifier) {
        return null;
      }

      // Direct lookup using mod:name format
      return merged.bees[identifier] || null;
    };

    const parent1Bee = findBee(mutation.parent1);
    const parent2Bee = findBee(mutation.parent2);
    const offspringBee = findBee(mutation.offspring);

    // Debug: Log Silicon and Certus offspring before checking
    if (
      mutation.offspring &&
      (mutation.offspring.includes("Silicon") ||
        mutation.offspring.includes("Certus"))
    ) {
      console.log(
        `\n🔍 Parsing mutation: offspring="${mutation.offspring}" chance=${mutation.chance}`
      );
      console.log(`   Found bee? ${!!offspringBee}`);
      if (offspringBee) {
        console.log(
          `   Bee mod:name = ${offspringBee.mod}:${offspringBee.name}`
        );
      }
    }

    if (!parent1Bee || !parent2Bee || !offspringBee) {
      // Check if this mutation is in manual_mutations.jsonc
      const isInManual = checkIfInManualMutations(
        mutation,
        manualMutationSet,
        merged.bees
      );

      if (isInManual) {
        skippedInManualCount++;
      } else {
        skippedMutationsCount++;
      }

      if (mutation.source) {
        const fullPath = path.resolve(mutation.source.file);
        const emoji = isInManual ? "ℹ️ " : "⚠️ ";
        console.warn(
          `${emoji} Skipping mutation: ${mutation.offspring}\n    ${fullPath}:${mutation.source.line}`
        );

        if (isInManual) {
          console.warn(`    → Already in manual_mutations.jsonc`);
        }
        console.warn(""); // Add blank line after each skipped mutation
      } else {
        const emoji = isInManual ? "ℹ️ " : "⚠️ ";
        console.warn(
          `${emoji} Skipping mutation: ${mutation.offspring}\n    (no source location)`
        );

        if (isInManual) {
          console.warn(`    → Already in manual_mutations.jsonc`);
        }
        console.warn(""); // Add blank line after each skipped mutation
      }
      return;
    }

    const parent1 = `${parent1Bee.mod.toLowerCase()}:${parent1Bee.name
      .toLowerCase()
      .replace(/\s+/g, "")}`;
    const parent2 = `${parent2Bee.mod.toLowerCase()}:${parent2Bee.name
      .toLowerCase()
      .replace(/\s+/g, "")}`;
    const offspring = `${offspringBee.mod.toLowerCase()}:${offspringBee.name
      .toLowerCase()
      .replace(/\s+/g, "")}`;

    // Create sorted key for parent pair (so [A,B] and [B,A] are treated the same)
    const parentKey = [parent1, parent2].sort().join("|");

    // Check if this exact mutation already exists in manual mutations
    const mutationKey = `${parentKey}|${offspring}|${mutation.chance / 100}`;

    // Debug: Log first few parsed mutation keys
    if (manualMutationSet.size > 0 && Math.random() < 0.01) {
      console.log(`Sample parsed mutation key: ${mutationKey}`);
    }

    if (manualMutationSet.has(mutationKey)) {
      // Skip - already in manual mutations
      skippedInManualCount++;
      return;
    }

    if (!mutationGroups.has(parentKey)) {
      mutationGroups.set(parentKey, {
        parents: [parent1, parent2].sort(),
        children: [],
      });
    }

    // Add offspring to this parent pair
    const childEntry = {
      species: offspring,
      chance: mutation.chance / 100, // Convert chance to decimal
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
  console.log(
    `  - Started with ${manualMutations.length} manual mutation groups`
  );
  console.log(
    `  - Added ${
      output.length - manualMutations.length
    } new groups from parsers`
  );
  console.log(`Skipped mutations: ${skippedMutationsCount}`);
  if (skippedInManualCount > 0) {
    console.log(
      `  - ${skippedInManualCount} already in manual_mutations.jsonc`
    );
  }

  // Convert map to array (only new entries not in manual mutations)
  const newGroups = Array.from(mutationGroups.values()).filter((group) => {
    const parentKey = group.parents.sort().join("|");
    // Check if this group was in the original manual mutations
    const wasManual = manualMutations.some(
      (manual) => manual.parents.sort().join("|") === parentKey
    );
    return !wasManual;
  });

  // Sort new groups
  const sortedGroups = newGroups.sort((a, b) => {
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
 * Check if a mutation is already in manual_mutations.jsonc
 */
function checkIfInManualMutations(mutation, manualMutationSet, beesMap) {
  // Identifier is already in mod:name format, just normalize case and spaces
  const tryResolve = (identifier) => {
    if (!identifier) return null;

    // Already in mod:name format, just ensure lowercase and no spaces
    if (identifier.includes(":")) {
      const [mod, name] = identifier.split(":");
      return `${mod.toLowerCase()}:${name
        .toLowerCase()
        .replace(/[_\s]+/g, "")}`;
    }

    return null;
  };

  const offspring = tryResolve(mutation.offspring);

  // If we can't resolve the offspring, it's not in manual mutations
  if (!offspring) {
    return false;
  }

  // Check if ANY manual mutation produces this offspring (regardless of parents or chance)
  for (const key of manualMutationSet) {
    const parts = key.split("|");
    if (parts.length >= 3) {
      // Key format: parent1|parent2|offspring|chance
      const manualOffspring = parts[2];

      // If this offspring is defined in manual mutations, it's already covered
      if (manualOffspring === offspring) {
        return true;
      }
    }
  }

  return false;
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
