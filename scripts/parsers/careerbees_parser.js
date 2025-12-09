/**
 * CareerBees CareerBeeSpecies.java Parser
 *
 * Parses CareerBees' CareerBeeSpecies.java file to extract bee species,
 * mutations, and branch information into the intermediate JSON format.
 *
 * CareerBees uses a different pattern: static CareerBeeEntry fields and
 * a BeeMutationTree class for mutations.
 */

const fs = require("fs");
const path = require("path");

/**
 * Parse CareerBees CareerBeeSpecies.java file
 * @param {string} filePath - Path to CareerBeeSpecies.java
 * @returns {Object} Intermediate format object with bees, mutations, and branches
 */
function parseCareerBeesSpecies(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  const result = {
    bees: {},
    mutations: [],
    branches: {},
  };

  // Extract static bee entries
  // Pattern: public static final CareerBeeEntry NAME = new CareerBeeEntry("name", dominant, "branch", col(r, g, b));
  const beePattern =
    /public\s+static\s+final\s+CareerBeeEntry\s+(\w+)\s*=\s*new\s+CareerBeeEntry\(\s*"([^"]+)"\s*,\s*(true|false)\s*,\s*"([^"]+)"\s*,\s*col\((\d+),\s*(\d+),\s*(\d+)\)/g;

  let match;
  while ((match = beePattern.exec(content)) !== null) {
    const [, enumName, name, dominant, branch, r, g, b] = match;

    // Convert to display name format
    const displayName = name
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
    // Use standardized mod:name format (lowercase, no spaces)
    const uid = `careerbees:${displayName.toLowerCase().replace(/\s+/g, "")}`;

    result.bees[uid] = {
      mod: "careerbees",
      name: displayName,
      binomial: name,
      branch: parseBranchName(branch),
      dominant: dominant === "true",
      colors: {
        primary: rgbToHex(parseInt(r), parseInt(g), parseInt(b)),
        secondary: rgbToHex(parseInt(r), parseInt(g), parseInt(b)),
      },
      temperature: "NORMAL",
      humidity: "NORMAL",
      hasEffect: false,
      isSecret: false,
      products: [],
    };

    // Store enum name for mutation parsing
    result.bees[uid]._enumName = enumName;
  }

  // Parse mutations from buildMutationList() method
  const mutations = parseMutationTree(content, result.bees, filePath);
  result.mutations.push(...mutations);

  // Extract branch names
  const branches = new Set();
  Object.values(result.bees).forEach((bee) => {
    if (bee.branch) {
      branches.add(bee.branch);
    }
  });

  branches.forEach((branchUID) => {
    const parts = branchUID.split(":");
    const name = parts[parts.length - 1];
    result.branches[branchUID] = {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      scientific: name,
    };
  });

  // Clean up temporary fields
  Object.values(result.bees).forEach((bee) => {
    delete bee._enumName;
  });

  return result;
}

/**
 * Parse branch name from CareerBees format
 */
function parseBranchName(branch) {
  if (branch.startsWith(":")) {
    // Root branch like ":discipulus"
    return `careerbees${branch}`;
  }
  // Branch with prefix like "consilium:graduati"
  return `careerbees:${branch}`;
}

/**
 * Parse mutations from buildMutationList() method
 */
function parseMutationTree(content, bees, filePath) {
  const mutations = [];

  // Extract the buildMutationList() method body
  const methodMatch = content.match(
    /public\s+static\s+void\s+buildMutationList\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/
  );
  if (!methodMatch) {
    console.warn("Could not find buildMutationList() method");
    return mutations;
  }

  const methodBody = methodMatch[1];
  const methodStartLine = content
    .substring(0, methodMatch.index)
    .split("\n").length;

  // Pattern: tree.add(PARENT1, PARENT2, OFFSPRING, CHANCE, optional_lambda);
  // Need to handle: STUDENT, getFSpecies("Valiant"), etc.
  // Use a more flexible pattern that handles function calls and identifiers
  const mutationPattern =
    /tree\.add\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([\d.]+)\s*(?:,\s*([^;]+?))?\s*\)\s*;/g;

  let match;
  while ((match = mutationPattern.exec(methodBody)) !== null) {
    const [, parent1Raw, parent2Raw, offspringRaw, chance, requirements] =
      match;

    // Calculate line number
    const linesBeforeMatch =
      methodBody.substring(0, match.index).split("\n").length - 1;
    const lineNumber = methodStartLine + linesBeforeMatch;

    const mutation = {
      parent1: resolveSpeciesReference(parent1Raw.trim(), bees),
      parent2: resolveSpeciesReference(parent2Raw.trim(), bees),
      offspring: resolveSpeciesReference(offspringRaw.trim(), bees),
      chance: parseFloat(chance),
      source: {
        file: filePath,
        line: lineNumber,
      },
    };

    // Parse requirements (lambda expressions)
    if (requirements) {
      const conditions = parseRequirements(requirements);
      if (Object.keys(conditions).length > 0) {
        mutation.conditions = conditions;
      }
    }

    mutations.push(mutation);
  }

  return mutations;
}

/**
 * Parse mutation requirements from lambda expression
 */
function parseRequirements(reqStr) {
  const conditions = {};

  // Pattern: v -> v.requireResource(Blocks.BOOKSHELF.getDefaultState())
  const blockMatch = reqStr.match(/requireResource\(Blocks\.(\w+)/);
  if (blockMatch) {
    conditions.block = [`minecraft:${blockMatch[1].toLowerCase()}`];
  }

  // Pattern: v -> v.requireBlock(...)
  const blockMatch2 = reqStr.match(/requireBlock\(([^)]+)\)/);
  if (blockMatch2) {
    const block = blockMatch2[1].trim();
    if (block.includes("Blocks.")) {
      const blockName = block.match(/Blocks\.(\w+)/);
      if (blockName) {
        conditions.block = [`minecraft:${blockName[1].toLowerCase()}`];
      }
    }
  }

  // Pattern: iBeeMutationBuilder -> iBeeMutationBuilder.addMutationCondition(new MutationRecentExplosion()...)
  if (reqStr.includes("MutationRecentExplosion")) {
    conditions.requireExplosion = true;
  }

  return conditions;
}

/**
 * Resolve species reference (enum name to UID)
 */
function resolveSpeciesReference(ref, bees) {
  ref = ref.trim();

  // Check for getFSpecies("Name") pattern - Forestry bee helper
  const getFSpeciesMatch = ref.match(/getFSpecies\s*\(\s*"([^"]+)"\s*\)/);
  if (getFSpeciesMatch) {
    const displayName = getFSpeciesMatch[1]
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
    return `forestry:${displayName.toLowerCase().replace(/\s+/g, "")}`;
  }

  // Check for getSpecies("mod:name") pattern
  const getSpeciesMatch = ref.match(/getSpecies\s*\(\s*"([^"]+)"\s*\)/);
  if (getSpeciesMatch) {
    // Already in mod:name format
    return getSpeciesMatch[1];
  }

  // Look up in CareerBees species by enum name
  for (const [uid, bee] of Object.entries(bees)) {
    if (bee._enumName === ref) {
      return uid;
    }
  }

  // Check for bare ALL_CAPS references
  const bareRefMatch = ref.match(/^([A-Z_]+)$/);
  if (bareRefMatch) {
    // First check if it's a CareerBees bee (must check before Forestry!)
    for (const [uid, bee] of Object.entries(bees)) {
      if (bee._enumName === ref) {
        return uid;
      }
    }
    // Otherwise assume it's a Forestry bee
    const displayName = ref
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
    return `forestry:${displayName.toLowerCase().replace(/\s+/g, "")}`;
  }

  // If no pattern matched, return as-is (likely will cause a skip warning)
  return ref;
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Main export function
 */
function parseCareerBees(javaFilePath) {
  try {
    console.log(`Parsing CareerBees CareerBeeSpecies: ${javaFilePath}`);
    const result = parseCareerBeesSpecies(javaFilePath);
    console.log(
      `Parsed ${Object.keys(result.bees).length} bees, ${
        result.mutations.length
      } mutations, ${Object.keys(result.branches).length} branches`
    );
    return result;
  } catch (error) {
    console.error(
      `Error parsing CareerBees CareerBeeSpecies: ${error.message}`
    );
    throw error;
  }
}

module.exports = { parseCareerBees };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      "Usage: node careerbees_parser.js <path-to-CareerBeeSpecies.java> [output-json-file]"
    );
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];

  const result = parseCareerBees(inputPath);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
