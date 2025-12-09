/**
 * Forestry BeeDefinition.java Parser
 *
 * Parses Forestry's BeeDefinition.java enum file to extract bee species,
 * mutations, and branch information into the intermediate JSON format.
 */

const fs = require("fs");
const path = require("path");

/**
 * Parse Forestry BeeDefinition.java file
 * @param {string} filePath - Path to BeeDefinition.java
 * @returns {Object} Intermediate format object with bees, mutations, and branches
 */
function parseForestryBeeDefinition(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  const result = {
    bees: {},
    mutations: [],
    branches: {},
  };

  // Extract enum constants - match until closing brace followed by comma or semicolon
  const enumPattern =
    /(\w+)\(BeeBranchDefinition\.(\w+),\s*"([^"]+)",\s*(true|false),\s*new Color\((0x[0-9A-Fa-f]+)\)(?:,\s*new Color\((0x[0-9A-Fa-f]+)\))?\)\s*\{([\s\S]*?)\s*\}\s*[,;]/g;

  let match;
  while ((match = enumPattern.exec(content)) !== null) {
    const [
      ,
      enumName,
      branchName,
      binomial,
      dominant,
      primaryColor,
      secondaryColor,
      body,
    ] = match;

    // Convert underscores to spaces with title case
    const displayName = enumName
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
    // Use standardized mod:name format (lowercase, no spaces)
    const uid = `forestry:${displayName.toLowerCase().replace(/\s+/g, "")}`;

    // Calculate line number where this enum body starts
    const linesBeforeMatch = content
      .substring(0, match.index)
      .split("\n").length;

    // Parse the bee body
    const beeData = parseBeeBody(body);

    result.bees[uid] = {
      mod: "Forestry",
      name: displayName,
      binomial: binomial,
      branch: `forestry:${branchName.toLowerCase()}`,
      dominant: dominant === "true",
      colors: {
        primary: hexToRGB(primaryColor),
        secondary: hexToRGB(secondaryColor || primaryColor),
      },
      temperature: beeData.temperature || "NORMAL",
      humidity: beeData.humidity || "NORMAL",
      hasEffect: beeData.hasEffect || false,
      isSecret: beeData.isSecret || false,
      products: beeData.products || [],
    };

    // Extract mutations from registerMutations method
    const mutations = parseMutations(body, uid, filePath, linesBeforeMatch);
    result.mutations.push(...mutations);
  }

  // Extract branch definitions (simplified - would need BeeBranchDefinition.java for complete data)
  const branchPattern = /BeeBranchDefinition\.(\w+)/g;
  const branches = new Set();
  while ((match = branchPattern.exec(content)) !== null) {
    branches.add(match[1]);
  }

  branches.forEach((branch) => {
    const branchUID = `forestry:${branch.toLowerCase()}`;
    result.branches[branchUID] = {
      name: branch.charAt(0) + branch.slice(1).toLowerCase(),
      scientific: branch,
    };
  });

  return result;
}

/**
 * Parse bee enum body to extract properties
 */
function parseBeeBody(body) {
  const data = {
    products: [],
    temperature: "NORMAL",
    humidity: "NORMAL",
    hasEffect: false,
    isSecret: false,
  };

  // Extract products
  const productPattern = /addProduct\(([^,]+),\s*([\d.]+)f\)/g;
  let match;
  while ((match = productPattern.exec(body)) !== null) {
    const [, item, chance] = match;
    data.products.push({
      item: cleanItemReference(item),
      chance: parseFloat(chance),
    });
  }

  // Extract specialties
  const specialtyPattern = /addSpecialty\(([^,]+),\s*([\d.]+)f\)/g;
  while ((match = specialtyPattern.exec(body)) !== null) {
    const [, item, chance] = match;
    data.products.push({
      item: cleanItemReference(item),
      chance: parseFloat(chance),
    });
  }

  // Extract temperature
  const tempMatch = body.match(/setTemperature\(EnumTemperature\.(\w+)\)/);
  if (tempMatch) {
    data.temperature = tempMatch[1];
  }

  // Extract humidity
  const humidMatch = body.match(/setHumidity\(EnumHumidity\.(\w+)\)/);
  if (humidMatch) {
    data.humidity = humidMatch[1];
  }

  // Check for effect
  data.hasEffect = body.includes("setHasEffect()");

  // Check for secret
  data.isSecret = body.includes("setIsSecret()");

  return data;
}

/**
 * Parse mutations from registerMutations method
 */
function parseMutations(body, offspring, filePath, bodyStartLine) {
  const mutations = [];

  // Pattern: registerMutation(PARENT1, PARENT2, chance)
  const mutationPattern =
    /registerMutation\((\w+),\s*(\w+),\s*(\d+)\)([^;]*);/g;

  let match;
  while ((match = mutationPattern.exec(body)) !== null) {
    const [, parent1, parent2, chance, conditions] = match;

    // Calculate line number within the body
    const linesBeforeMatch =
      body.substring(0, match.index).split("\n").length - 1;
    const lineNumber = bodyStartLine + linesBeforeMatch;

    const mutation = {
      parent1: resolveSpeciesReference(parent1),
      parent2: resolveSpeciesReference(parent2),
      offspring: offspring,
      chance: parseInt(chance),
      source: {
        file: filePath,
        line: lineNumber,
      },
    };

    // Parse conditions
    const parsedConditions = parseConditions(conditions);
    if (Object.keys(parsedConditions).length > 0) {
      mutation.conditions = parsedConditions;
    }

    mutations.push(mutation);
  }

  return mutations;
}

/**
 * Parse mutation conditions
 */
function parseConditions(conditionsStr) {
  const conditions = {};

  // Temperature restriction
  const tempMatch = conditionsStr.match(/restrictTemperature\(([^)]+)\)/);
  if (tempMatch) {
    const temps = tempMatch[1]
      .split(",")
      .map((t) => t.trim().replace("EnumTemperature.", ""));
    conditions.temperature = temps;
  }

  // Humidity restriction
  const humidMatch = conditionsStr.match(/restrictHumidity\(([^)]+)\)/);
  if (humidMatch) {
    const humids = humidMatch[1]
      .split(",")
      .map((h) => h.trim().replace("EnumHumidity.", ""));
    conditions.humidity = humids;
  }

  // Biome type restriction
  const biomeMatch = conditionsStr.match(
    /restrictBiomeType\(BiomeDictionary\.Type\.(\w+)\)/
  );
  if (biomeMatch) {
    conditions.biome = [biomeMatch[1]];
  }

  // Date range restriction (for seasonal bees)
  const dateMatch = conditionsStr.match(
    /restrictDateRange\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/
  );
  if (dateMatch) {
    conditions.dateRange = {
      startMonth: parseInt(dateMatch[1]),
      startDay: parseInt(dateMatch[2]),
      endMonth: parseInt(dateMatch[3]),
      endDay: parseInt(dateMatch[4]),
    };
  }

  // Day/Night requirement
  if (conditionsStr.includes("requireDay()")) {
    conditions.timeOfDay = "DAY";
  } else if (conditionsStr.includes("requireNight()")) {
    conditions.timeOfDay = "NIGHT";
  }

  // Resource block requirement
  const resourceMatch = conditionsStr.match(/requireResource\(([^)]+)\)/);
  if (resourceMatch) {
    conditions.requiredBlock = cleanItemReference(resourceMatch[1]);
  }

  // Secret mutation flag
  if (conditionsStr.includes("setIsSecret()")) {
    conditions.isSecret = true;
  }

  return conditions;
}

/**
 * Resolve species reference (enum name to UID)
 * Returns null for loop variables or invalid references
 */
function resolveSpeciesReference(ref) {
  if (ref === "BeeDefinition") return null; // Skip class name

  // Skip loop variables and dynamic references
  const loopVariables = /^(hiveBee\d*|parent\d+|bee\d*)$/i;
  if (loopVariables.test(ref)) {
    return null; // Cannot resolve dynamic loop variables
  }

  // Forestry bee reference - convert to mod:name format
  const displayName = ref.split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  return `forestry:${displayName.toLowerCase().replace(/\s+/g, "")}`;
}

/**
 * Clean item reference for readability
 */
function cleanItemReference(item) {
  // Extract comb types
  const combMatch = item.match(/EnumHoneyComb\.(\w+)/);
  if (combMatch) {
    return combMatch[1];
  }

  // Extract Minecraft items
  const itemMatch = item.match(/Items\.(\w+)/);
  if (itemMatch) {
    return `minecraft:${itemMatch[1].toLowerCase()}`;
  }

  // Extract blocks
  const blockMatch = item.match(/Blocks\.(\w+)/);
  if (blockMatch) {
    return `minecraft:${blockMatch[1].toLowerCase()}`;
  }

  // Return as-is if not recognized
  return item;
}

/**
 * Convert hex color to RGB string
 */
function hexToRGB(hex) {
  if (!hex) return "#FFFFFF";

  // Remove 0x prefix and convert
  const cleanHex = hex.replace("0x", "");
  return "#" + cleanHex.padStart(6, "0").toUpperCase();
}

/**
 * Main export function
 */
function parseForestry(javaFilePath) {
  try {
    console.log(`Parsing Forestry BeeDefinition: ${javaFilePath}`);
    const result = parseForestryBeeDefinition(javaFilePath);
    console.log(
      `Parsed ${Object.keys(result.bees).length} bees, ${
        result.mutations.length
      } mutations, ${Object.keys(result.branches).length} branches`
    );
    return result;
  } catch (error) {
    console.error(`Error parsing Forestry BeeDefinition: ${error.message}`);
    throw error;
  }
}

module.exports = { parseForestry };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      "Usage: node forestry_parser.js <path-to-BeeDefinition.java> [output-json-file]"
    );
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];

  const result = parseForestry(inputPath);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
