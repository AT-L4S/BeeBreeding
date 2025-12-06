/**
 * GenDustry .cfg Parser for MeatballCraft
 *
 * Parses GenDustry configuration files (.cfg) and extracts bee species,
 * mutations, and branch information into the intermediate JSON format.
 */

const fs = require("fs");
const path = require("path");

/**
 * Parse a GenDustry .cfg file
 * @param {string} filePath - Path to the .cfg file
 * @returns {Object} Intermediate format object with bees, mutations, and branches
 */
function parseGenDustryConfig(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const result = {
    bees: {},
    mutations: [],
    branches: {},
  };

  let currentSection = null;
  let currentBlock = {};
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) continue;

    // Detect section headers
    if (line.includes("Branches {")) {
      currentSection = "branches";
      braceDepth = 1;
      continue;
    } else if (line.includes("Bees {")) {
      currentSection = "bees";
      braceDepth = 1;
      continue;
    } else if (line.includes("Mutations {")) {
      currentSection = "mutations";
      braceDepth = 1;
      continue;
    }

    // Track brace depth
    if (line.includes("{")) braceDepth++;
    if (line.includes("}")) {
      braceDepth--;

      // End of a block
      if (braceDepth === 1 && Object.keys(currentBlock).length > 0) {
        processBlock(currentSection, currentBlock, result);
        currentBlock = {};
      }

      // End of section
      if (braceDepth === 0) {
        currentSection = null;
      }
      continue;
    }

    // Parse key-value pairs
    if (currentSection && braceDepth > 1) {
      const match = line.match(/(\w+)\s*=\s*(.+)/);
      if (match) {
        const [, key, value] = match;
        currentBlock[key] = parseValue(value);
      }
    }
  }

  return result;
}

/**
 * Parse a configuration value, removing quotes and converting types
 */
function parseValue(value) {
  value = value.trim();

  // Remove trailing comments
  const commentIndex = value.indexOf("#");
  if (commentIndex !== -1) {
    value = value.substring(0, commentIndex).trim();
  }

  // Remove quotes
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  // Parse numbers
  if (!isNaN(value)) {
    return parseFloat(value);
  }

  // Parse booleans
  if (value === "true") return true;
  if (value === "false") return false;

  return value;
}

/**
 * Process a parsed block based on section type
 */
function processBlock(section, block, result) {
  if (section === "branches") {
    processBranchBlock(block, result);
  } else if (section === "bees") {
    processBeeBlock(block, result);
  } else if (section === "mutations") {
    processMutationBlock(block, result);
  }
}

/**
 * Process a branch definition block
 */
function processBranchBlock(block, result) {
  const uid = block.uid || block.name;
  result.branches[uid] = {
    name: block.name || uid,
    scientific: block.scientific || block.name || uid,
  };
}

/**
 * Process a bee species block
 */
function processBeeBlock(block, result) {
  const uid = block.uid;
  if (!uid) return;

  // Parse color hex values
  const primaryColor = parseColor(block.primaryColor || block.primary);
  const secondaryColor = parseColor(block.secondaryColor || block.secondary);

  result.bees[uid] = {
    mod: "MeatballCraft",
    name: block.name || extractNameFromUID(uid),
    binomial: block.binomial || block.scientific || "",
    branch: block.branch || "",
    dominant: block.dominant !== false,
    colors: {
      primary: primaryColor,
      secondary: secondaryColor,
    },
    temperature: block.temperature || "NORMAL",
    humidity: block.humidity || "NORMAL",
    hasEffect: block.hasEffect === true,
    isSecret: block.isSecret === true,
    products: parseProducts(block),
  };
}

/**
 * Process a mutation block
 */
function processMutationBlock(block, result) {
  const mutation = {
    parent1: block.parent1 || block.allele1,
    parent2: block.parent2 || block.allele2,
    offspring: block.result || block.species,
    chance: parseFloat(block.chance || 10),
  };

  // Add conditions if present
  const conditions = {};

  if (block.temperature) {
    conditions.temperature = Array.isArray(block.temperature)
      ? block.temperature
      : [block.temperature];
  }

  if (block.humidity) {
    conditions.humidity = Array.isArray(block.humidity)
      ? block.humidity
      : [block.humidity];
  }

  if (block.biome) {
    conditions.biome = Array.isArray(block.biome) ? block.biome : [block.biome];
  }

  if (block.requireBlock || block.block) {
    conditions.block = Array.isArray(block.requireBlock || block.block)
      ? block.requireBlock || block.block
      : [block.requireBlock || block.block];
  }

  if (Object.keys(conditions).length > 0) {
    mutation.conditions = conditions;
  }

  result.mutations.push(mutation);
}

/**
 * Parse color value to hex format
 */
function parseColor(colorValue) {
  if (!colorValue) return "#FFFFFF";

  // Already in hex format
  if (typeof colorValue === "string" && colorValue.startsWith("#")) {
    return colorValue.toUpperCase();
  }

  // Integer color value
  if (typeof colorValue === "number") {
    return "#" + colorValue.toString(16).padStart(6, "0").toUpperCase();
  }

  return "#FFFFFF";
}

/**
 * Extract display name from UID
 */
function extractNameFromUID(uid) {
  const parts = uid.split(".");
  const name = parts[parts.length - 1];
  // Convert camelCase or speciesName to proper case
  return name
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Parse products from bee block
 */
function parseProducts(block) {
  const products = [];

  // Look for product and specialty fields
  const productFields = Object.keys(block).filter(
    (key) => key.startsWith("product") || key.startsWith("specialty")
  );

  productFields.forEach((field) => {
    const value = block[field];
    const chanceField = field + "Chance";
    const chance = parseFloat(block[chanceField] || 0.1);

    if (value) {
      products.push({
        item: value,
        chance: chance,
      });
    }
  });

  return products;
}

/**
 * Main export function
 */
function parseGenddustry(configPath) {
  try {
    console.log(`Parsing GenDustry config: ${configPath}`);
    const result = parseGenDustryConfig(configPath);
    console.log(
      `Parsed ${Object.keys(result.bees).length} bees, ${
        result.mutations.length
      } mutations, ${Object.keys(result.branches).length} branches`
    );
    return result;
  } catch (error) {
    console.error(`Error parsing GenDustry config: ${error.message}`);
    throw error;
  }
}

module.exports = { parseGenddustry };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      "Usage: node genddustry_parser.js <path-to-cfg-file> [output-json-file]"
    );
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];

  const result = parseGenddustry(inputPath);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
