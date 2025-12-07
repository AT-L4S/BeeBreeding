/**
 * Main Build Script
 *
 * Orchestrates all parsers to convert mod source files into final JSONC data files.
 * Reads mod source locations, runs appropriate parsers, and builds output files.
 */

const fs = require("fs");
const path = require("path");

// Import parsers
const {
  parseMeatballCraftConfig,
} = require("./parsers/meatballcraft_config_parser");
const { parseForestry } = require("./parsers/forestry_parser");
const { parseExtraBees } = require("./parsers/extrabees_parser");
const { parseCareerBees } = require("./parsers/careerbees_parser");
const { parseMagicBees } = require("./parsers/magicbees_parser");
const { buildOutputFiles } = require("./output_builder");

/**
 * Configuration for mod parsers
 * Ordered array: Forestry first (base mod), then addon mods, then GenDustry
 * Update these paths based on MOD_SOURCE_LOCATIONS.md
 */
const MOD_CONFIGS = [
  {
    key: "forestry",
    name: "Forestry",
    parser: parseForestry,
    sourceFile: path.join(
      __dirname,
      "../whiteboard/ForestryMC-mc-1.12/src/main/java/forestry/apiculture/genetics/BeeDefinition.java"
    ),
  },
  {
    key: "extrabees",
    name: "ExtraBees",
    parser: parseExtraBees,
    sourceFile: path.join(
      __dirname,
      "../whiteboard/Binnie-master-MC1.12/extrabees/src/main/java/binnie/extrabees/genetics/ExtraBeeDefinition.java"
    ),
  },
  {
    key: "careerbees",
    name: "CareerBees",
    parser: parseCareerBees,
    sourceFile: path.join(
      __dirname,
      "../whiteboard/Careerbees-master/src/main/java/com/rwtema/careerbees/bees/CareerBeeSpecies.java"
    ),
  },
  {
    key: "magicbees",
    name: "MagicBees",
    parser: parseMagicBees,
    sourceFile: path.join(
      __dirname,
      "../whiteboard/MagicBees-1.12/src/main/java/magicbees/bees/EnumBeeSpecies.java"
    ),
  },
  {
    key: "meatballcraft",
    name: "MeatballCraft",
    parser: parseGenDustryConfig,
    sourceFile: path.join(__dirname, "../whiteboard/meatball_bees.cfg"),
  },
];

/**
 * Parse all mods and collect intermediate data
 */
function parseAllMods(modsToInclude = null) {
  const intermediateData = [];
  const modsConfig = modsToInclude
    ? MOD_CONFIGS.filter((config) => modsToInclude.includes(config.key))
    : MOD_CONFIGS;

  console.log("Starting mod parsing...\n");
  console.log("Parse order: Forestry → Standalone Addons → GenDustry\n");

  for (const config of modsConfig) {
    console.log(`\n=== Parsing ${config.name} ===`);

    // Check if source file exists
    if (!fs.existsSync(config.sourceFile)) {
      console.warn(`⚠️  Source file not found: ${config.sourceFile}`);
      console.warn(`   Skipping ${config.name}`);
      continue;
    }

    try {
      const data = config.parser(config.sourceFile);
      intermediateData.push(data);
      console.log(`✓ Successfully parsed ${config.name}`);
      console.log(
        `  → ${Object.keys(data.bees).length} bees, ${
          data.mutations.length
        } mutations`
      );
    } catch (error) {
      console.error(`✗ Error parsing ${config.name}: ${error.message}`);
      console.error(`  Stack: ${error.stack}`);
      // Continue with other mods
    }
  }

  console.log(`\n=== Parsing Complete ===`);
  console.log(`Successfully parsed ${intermediateData.length} mod(s)\n`);

  return intermediateData;
}

/**
 * Main build function
 */
function build(options = {}) {
  const {
    modsToInclude = null,
    outputDir = path.join(__dirname, "data"),
    saveIntermediate = false,
    intermediateDir = path.join(__dirname, "intermediate"),
  } = options;

  console.log("╔═══════════════════════════════════════╗");
  console.log("║   Bee Breeding Data Build Script     ║");
  console.log("╚═══════════════════════════════════════╝\n");

  try {
    // Parse all mods
    const intermediateData = parseAllMods(modsToInclude);

    if (intermediateData.length === 0) {
      console.error("No mods were successfully parsed. Exiting.");
      process.exit(1);
    }

    // Save intermediate files if requested
    if (saveIntermediate) {
      console.log("\n=== Saving Intermediate Files ===");
      if (!fs.existsSync(intermediateDir)) {
        fs.mkdirSync(intermediateDir, { recursive: true });
      }

      intermediateData.forEach((data, index) => {
        const modName = Object.values(data.bees)[0]?.mod || `mod_${index}`;
        const filename = `${modName.toLowerCase()}_intermediate.json`;
        const filepath = path.join(intermediateDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`Saved ${filepath}`);
      });
    }

    // Build output files
    console.log("\n=== Building Output Files ===");
    buildOutputFiles(intermediateData, outputDir);

    console.log("\n╔═══════════════════════════════════════╗");
    console.log("║        Build Complete! ✓              ║");
    console.log("╚═══════════════════════════════════════╝\n");
  } catch (error) {
    console.error("\n╔═══════════════════════════════════════╗");
    console.error("║        Build Failed! ✗                ║");
    console.error("╚═══════════════════════════════════════╝\n");
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    process.exit(1);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const options = {
    modsToInclude: null,
    outputDir: path.join(__dirname, "data"),
    saveIntermediate: false,
    intermediateDir: path.join(__dirname, "intermediate"),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--help":
      case "-h":
        console.log("Usage: node build.js [options]");
        console.log("");
        console.log("Options:");
        console.log(
          "  --mods <mod1,mod2,...>     Only build specific mods (forestry,extrabees,careerbees,magicbees,meatballcraft)"
        );
        console.log(
          "  --output-dir <dir>         Output directory for JSONC files (default: scripts/data)"
        );
        console.log(
          "  --save-intermediate        Save intermediate JSON files"
        );
        console.log(
          "  --intermediate-dir <dir>   Directory for intermediate files (default: ./scripts/intermediate)"
        );
        console.log("  --help, -h                 Show this help message");
        console.log("");
        console.log("Examples:");
        console.log("  node build.js");
        console.log("  node build.js --mods forestry,extrabees");
        console.log("  node build.js --save-intermediate");
        console.log(
          "  node build.js --output-dir ./output --save-intermediate"
        );
        process.exit(0);

      case "--mods":
        if (i + 1 < args.length) {
          options.modsToInclude = args[i + 1].split(",").map((m) => m.trim());
          i++;
        }
        break;

      case "--output-dir":
        if (i + 1 < args.length) {
          options.outputDir = args[i + 1];
          i++;
        }
        break;

      case "--save-intermediate":
        options.saveIntermediate = true;
        break;

      case "--intermediate-dir":
        if (i + 1 < args.length) {
          options.intermediateDir = args[i + 1];
          i++;
        }
        break;
    }
  }

  build(options);
}

module.exports = { build, parseAllMods, MOD_CONFIGS };
