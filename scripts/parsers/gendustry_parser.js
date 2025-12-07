/**
 * GenDustry .cfg Parser for MeatballCraft
 *
 * Parses GenDustry BACON configuration files (.cfg) and extracts bee species,
 * mutations, and branch information into the intermediate JSON format.
 */

const fs = require("fs");
const path = require("path");

/**
 * Remove comments from BACON content
 */
function removeComments(content) {
  // Remove multi-line comments /* */
  content = content.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments //
  content = content.replace(/\/\/.*$/gm, "");
  return content;
}

/**
 * Parse a GenDustry .cfg file using BACON format
 * @param {string} filePath - Path to the .cfg file
 * @returns {Object} Intermediate format object with bees, mutations, and branches
 */
function parseGenDustryConfig(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  content = removeComments(content);

  const result = {
    bees: {},
    mutations: [],
    branches: {},
  };

  // Simple approach: just find each section and extract it
  const sections = extractAllSections(content);

  if (sections.Branches) {
    parseBranchesSection(sections.Branches, result);
  }

  if (sections.Bees) {
    parseBeesSection(sections.Bees, result, filePath);
  }

  if (sections.Mutations) {
    parseMutationsSection(sections.Mutations, result);
  }

  return result;
}

/**
 * Extract all top-level cfg sections
 */
function extractAllSections(content) {
  const sections = {};
  const sectionNames = ["Branches", "Bees", "Mutations"];

  for (const sectionName of sectionNames) {
    const regex = new RegExp(`cfg\\s+${sectionName}\\s*\\{`, "i");
    const match = content.match(regex);
    if (!match) continue;

    const startIndex = match.index + match[0].length;
    let braceDepth = 1;
    let endIndex = startIndex;

    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === "{") braceDepth++;
      if (content[i] === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    sections[sectionName] = content.substring(startIndex, endIndex);
  }

  return sections;
}

/**
 * Parse the Branches section
 */
function parseBranchesSection(content, result) {
  // Simple non-nested pattern for branches
  const branchPattern = /cfg\s+(\w+)\s*\{([^}]*)\}/g;
  let match;

  while ((match = branchPattern.exec(content)) !== null) {
    const branchName = match[1];
    const branchContent = match[2];

    const branchData = parseKeyValuePairs(branchContent);
    const uid = branchData.UID || `gendustry.${branchName.toLowerCase()}`;

    result.branches[uid] = {
      name: branchName,
      scientific: branchData.Scientific || branchName,
      parent: branchData.Parent || "apidae",
    };
  }
}

/**
 * Parse the Bees section
 */
function parseBeesSection(content, result, filePath) {
  // Split into individual bee blocks by looking for "cfg BeeName {"
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const cfgMatch = line.match(/^\s*cfg\s+(\w+)\s*\{/);

    if (cfgMatch) {
      const beeName = cfgMatch[1];
      // Extract this bee's block
      let braceDepth = 1;
      let beeContent = "";
      i++;

      while (i < lines.length && braceDepth > 0) {
        const currentLine = lines[i];

        // Count braces in this line
        for (const char of currentLine) {
          if (char === "{") braceDepth++;
          if (char === "}") braceDepth--;
        }

        if (braceDepth > 0) {
          beeContent += currentLine + "\n";
        }
        i++;
      }

      processBeeBlock(beeName, beeContent, result, filePath);
    } else {
      i++;
    }
  }
}

/**
 * Parse key-value pairs from BACON content
 */
function parseKeyValuePairs(content) {
  const data = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match key = value
    const match = trimmed.match(/^(\w+)\s*=\s*(.+?)$/);
    if (match) {
      const key = match[1];
      const value = parseValue(match[2].trim());
      data[key] = value;
    }
  }

  return data;
}

/**
 * Parse a BACON value, removing quotes and converting types
 */
function parseValue(value) {
  value = value.trim();

  // Remove quotes
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  // Parse hex colors (0xRRGGBB)
  if (value.startsWith("0x")) {
    return "#" + value.slice(2).toUpperCase().padStart(6, "0");
  }

  // Parse numbers
  if (/^-?\d+\.?\d*$/.test(value)) {
    return parseFloat(value);
  }

  // Parse booleans
  if (value === "Yes" || value === "yes" || value === "true") return true;
  if (value === "No" || value === "no" || value === "false") return false;

  return value;
}

/**
 * Process a bee definition block
 */
function processBeeBlock(beeName, content, result, filePath) {
  const data = {};
  let traitsContent = "";

  // Extract cfg Traits block if present
  const traitsMatch = content.match(/cfg\s+Traits\s*\{([^}]*)\}/);
  if (traitsMatch) {
    traitsContent = traitsMatch[1];
    // Remove it from content so we don't parse it again
    content = content.replace(/cfg\s+Traits\s*\{[^}]*\}/, "");
  }

  // Parse main bee properties
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    // Check for DropsList
    if (line.match(/^(Products|Specialty)\s*=\s*DropsList\(/)) {
      const keyMatch = line.match(/^(\w+)\s*=/);
      if (keyMatch) {
        const key = keyMatch[1];
        let dropsStr = line;

        // Collect multi-line DropsList
        while (!dropsStr.includes(")") && i < lines.length - 1) {
          i++;
          dropsStr += "\n" + lines[i];
        }

        data[key] = parseDropsList(dropsStr);
      }
      i++;
      continue;
    }

    // Regular key-value pair
    const match = line.match(/^(\w+)\s*=\s*(.+?)$/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();
      data[key] = parseValue(value);
    }

    i++;
  }

  // Parse traits
  const traits = parseKeyValuePairs(traitsContent);

  // Create bee entry
  const uid = `gendustry.${beeName.toLowerCase()}`;

  // Combine products and mark specialty products
  const products = [];

  // Add regular products
  if (data.Products && Array.isArray(data.Products)) {
    data.Products.forEach((product) => {
      products.push({
        ...product,
        isSpecialty: false,
      });
    });
  }

  // Add specialty products
  if (data.Specialty && Array.isArray(data.Specialty)) {
    data.Specialty.forEach((product) => {
      products.push({
        ...product,
        isSpecialty: true,
      });
    });
  }

  result.bees[uid] = {
    mod: "MeatballCraft",
    name: beeName,
    binomial: data.Binominal || beeName,
    branch: data.Branch || "",
    dominant: data.Dominant === true,
    colors: {
      primary: data.PrimaryColor || "#FFFFFF",
      secondary: data.SecondaryColor || "#FFFFFF",
    },
    temperature: (data.Temperature || "Normal").toUpperCase(),
    humidity: (data.Humidity || "Normal").toUpperCase(),
    hasEffect: data.Glowing === true,
    isSecret: data.Secret === true,
    isNocturnal: data.Nocturnal === true,
    products: products,
    traits: traits,
  };
}

/**
 * Parse DropsList() syntax
 */
function parseDropsList(dropsListStr) {
  const drops = [];

  // Extract content between DropsList( and )
  const match = dropsListStr.match(/DropsList\(([\s\S]*?)\)/);
  if (!match) return drops;

  const content = match[1];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match: 30% HoneyComb:meatball or 10% I:contenttweaker:meatball
    const dropMatch = trimmed.match(/^(\d+)%\s+(.+?)$/);
    if (dropMatch) {
      const chance = parseInt(dropMatch[1]) / 100;
      const item = dropMatch[2].trim();

      drops.push({
        item: item,
        chance: chance,
      });
    }
  }

  return drops;
}

/**
 * Parse the Mutations section (if present)
 */
function parseMutationsSection(content, result) {
  // Match each mutation definition: cfg MutationName { ... }
  const mutationPattern = /cfg\s+(\w+)\s*\{([^}]*)\}/g;
  let match;

  while ((match = mutationPattern.exec(content)) !== null) {
    const mutationName = match[1];
    const mutationContent = match[2];

    const mutationData = parseKeyValuePairs(mutationContent);

    const mutation = {
      parent1: mutationData.Parent1 || mutationData.Allele1,
      parent2: mutationData.Parent2 || mutationData.Allele2,
      offspring: mutationData.Result || mutationData.Offspring,
      chance: parseFloat(mutationData.Chance || 10),
    };

    // Add conditions if present
    const conditions = {};

    if (mutationData.Temperature) {
      conditions.temperature = Array.isArray(mutationData.Temperature)
        ? mutationData.Temperature
        : [mutationData.Temperature];
    }

    if (mutationData.Humidity) {
      conditions.humidity = Array.isArray(mutationData.Humidity)
        ? mutationData.Humidity
        : [mutationData.Humidity];
    }

    if (mutationData.Biome) {
      conditions.biome = Array.isArray(mutationData.Biome)
        ? mutationData.Biome
        : [mutationData.Biome];
    }

    if (mutationData.RequireBlock || mutationData.Block) {
      const block = mutationData.RequireBlock || mutationData.Block;
      conditions.block = Array.isArray(block) ? block : [block];
    }

    if (Object.keys(conditions).length > 0) {
      mutation.conditions = conditions;
    }

    result.mutations.push(mutation);
  }
}

/**
 * Main export function
 */
function parseGendustry(configPath) {
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
    console.error(error.stack);
    throw error;
  }
}

module.exports = { parseGendustry };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      "Usage: node gendustry_parser.js <path-to-cfg-file> [output-json-file]"
    );
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];

  const result = parseGendustry(inputPath);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
