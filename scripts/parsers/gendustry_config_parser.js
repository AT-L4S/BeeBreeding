/**
 * Gendustry Config Parser
 *
 * Parses Gendustry BACON configuration files (.cfg) and extracts bee species,
 * mutations, and branch information into the intermediate JSON format.
 *
 * Gendustry is a bee genetics mod that uses BACON config format for custom bees.
 * This parser can handle any Gendustry config file (e.g., MeatballCraft's custom bees).
 */

const fs = require("fs");
const path = require("path");

/**
 * Remove comments from BACON contente
 */
function removeComments(content) {
  // Remove multi-line comments /* */
  content = content.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments //
  content = content.replace(/\/\/.*$/gm, "");
  return content;
}

/**
 * Parse a Gendustry .cfg file using BACON format
 * @param {string} filePath - Path to the .cfg file
 * @param {string} modName - Name of the mod (e.g., "Gendustry", "MeatballCraft")
 * @returns {Object} Intermediate format object with bees, mutations, and branches
 */
function parseGendustryConfigFile(filePath, modName = "Gendustry") {
  let content = fs.readFileSync(filePath, "utf-8");
  content = removeComments(content);

  const result = {
    bees: {},
    mutations: [],
    branches: {},
    modName: modName, // Store mod name for use in bee processing
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

  // Parse inline mutations from recipes section
  if (sections.recipes) {
    parseRecipesMutations(sections.recipes, result, filePath);
  }

  return result;
}

/**
 * Extract all top-level cfg sections and recipes section
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

  // Extract all recipes sections (there may be multiple)
  // We need to merge them all together
  const recipesRegex = /recipes\s*\{/gi;
  let recipesContent = "";
  let match;

  while ((match = recipesRegex.exec(content)) !== null) {
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

    recipesContent += content.substring(startIndex, endIndex) + "\n";
  }

  if (recipesContent) {
    sections.recipes = recipesContent;
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

  // Create display name (convert BeeName to "Bee Name")
  const displayName = beeName
    .split(/(?=[A-Z])/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

  // Determine mod prefix based on naming convention
  const isMeatballCraft = beeName.charAt(0) === beeName.charAt(0).toUpperCase();
  const modPrefix = isMeatballCraft ? "meatballcraft" : "gendustry";

  // Create standardized UID: mod:name (all lowercase, no spaces)
  const uid = `${modPrefix}:${displayName.toLowerCase().replace(/\s+/g, "")}`;

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
    mod: result.modName || "MeatballCraft",
    name: displayName,
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
 * Parse inline mutations from recipes section
 * Format: mutation: CHANCE% "parent1" + "parent2" => "offspring" Req Condition Value
 */
function parseRecipesMutations(content, result, filePath) {
  // Calculate the starting line of the recipes section in the file
  const fullContent = fs.readFileSync(filePath, "utf-8");
  const recipesMatch = fullContent.match(/recipes\s*\{/);
  const recipesStartLine = recipesMatch
    ? fullContent.substring(0, recipesMatch.index).split("\n").length
    : 0;

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match: mutation: 10% "forestry.speciesIndustrious" + "forestry.speciesDiligent" => "gendustry.bee.Meatball" Req Temperature Hot
    const mutationMatch = line.match(
      /^mutation:\s*(\d+)%\s*"([^"]+)"\s*\+\s*"([^"]+)"\s*=>\s*"([^"]+)"(?:\s+(.*))?$/
    );

    if (mutationMatch) {
      const [, chance, parent1, parent2, offspring, requirementsStr] =
        mutationMatch;

      // Normalize offspring UID to proper format based on config type
      // For MeatballCraft config: "gendustry.bee.Meatball" -> "MeatballCraft:Meatball"
      // For Gendustry config: "gendustry.bee.lightblue" -> "Gendustry:lightblue"
      const offspringRaw = offspring.trim().replace(/\.bee\./, ".");
      const offspringParts = offspringRaw.split(".");
      const offspringName = offspringParts[offspringParts.length - 1];

      // Determine mod name and normalize bee name format
      const isMeatballCraft =
        offspringName.charAt(0) === offspringName.charAt(0).toUpperCase();
      const modName = isMeatballCraft ? "meatballcraft" : "gendustry";
      const displayName = offspringName
        .split("_")
        .map(
          (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        )
        .join(" ");
      const normalizedOffspring = `${modName}:${displayName
        .toLowerCase()
        .replace(/\s+/g, "")}`;

      const mutation = {
        parent1: normalizeParentUID(parent1.trim()),
        parent2: normalizeParentUID(parent2.trim()),
        offspring: normalizedOffspring,
        chance: parseInt(chance),
        source: {
          file: filePath,
          line: recipesStartLine + i + 1,
        },
      };

      // Parse requirements if present
      if (requirementsStr) {
        const conditions = parseInlineRequirements(requirementsStr);
        if (Object.keys(conditions).length > 0) {
          mutation.conditions = conditions;
        }
      }

      result.mutations.push(mutation);
    }
  }
}

/**
 * Normalize parent UID from Gendustry format to standard format
 * Examples:
 *   forestry.speciesIndustrious → forestry:Industrious
 *   extrabees.species.acidic → extrabees:Acidic
 *   magicbees.speciesForlorn → magicbees:Forlorn
 *   careerbees.acceleration → careerbees:Acceleration
 */
function normalizeParentUID(uid) {
  // Map of mod prefixes to proper mod names
  const modMap = {
    forestry: "forestry",
    extrabees: "extrabees",
    magicbees: "magicbees",
    careerbees: "careerbees",
    gendustry: "meatballcraft",
  };

  // Parse the UID
  const parts = uid.split(".");

  if (parts.length < 2) {
    return uid; // Not a valid format
  }

  const modPrefix = parts[0].toLowerCase();
  const modName = modMap[modPrefix];

  if (!modName) {
    return uid; // Unknown mod
  }

  // Extract species name
  let speciesName = "";

  if (parts[1].toLowerCase() === "bee" && parts.length === 3) {
    // Handle: gendustry.bee.UniversalConstellation → UniversalConstellation
    speciesName = parts[2];
  } else if (parts[1].toLowerCase().startsWith("species")) {
    // Handle: forestry.speciesIndustrious or extrabees.species.acidic
    if (parts.length === 2) {
      // forestry.speciesIndustrious → Industrious
      speciesName = parts[1].substring(7); // Remove "species" prefix
    } else if (parts.length === 3) {
      // extrabees.species.acidic → Acidic
      speciesName = parts[2];
    }
  } else {
    // Handle: careerbees.acceleration → Acceleration
    speciesName = parts[1];
  }

  // Determine if this is a Gendustry built-in bee (all lowercase)
  if (speciesName) {
    // Check if the species name is all lowercase (Gendustry built-in bees)
    const isGendustryBuiltIn = speciesName === speciesName.toLowerCase();

    if (isGendustryBuiltIn && modName === "meatballcraft") {
      // This is a Gendustry built-in bee referenced from MeatballCraft config
      return `gendustry:${speciesName}`;
    }

    // Handle MagicBees TE/AE prefixes and convert to display format
    if (modName === "magicbees" && /^[A-Z]{2}[A-Z][a-z]/.test(speciesName)) {
      speciesName = speciesName.replace(/^([A-Z]{2})([A-Z][a-z])/, "$1_$2");
    }

    // Convert to display name format (title case with spaces), then to lowercase no-spaces
    if (!isGendustryBuiltIn) {
      const displayName = speciesName
        .split("_")
        .map((part) => {
          if (part.length === 2 && /^[A-Z]{2}$/.test(part)) {
            return part;
          }
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(" ");
      speciesName = displayName.toLowerCase().replace(/\s+/g, "");
    }
  }

  return `${modName}:${speciesName}`;
}

/**
 * Parse inline mutation requirements
 * Format: Req Temperature Hot, Req Biome Hell, Req Block B:wool@1
 */
function parseInlineRequirements(reqStr) {
  const conditions = {};

  // Match: Req Temperature Hot
  const tempMatch = reqStr.match(/Req\s+Temperature\s+(\w+)/i);
  if (tempMatch) {
    conditions.temperature = [tempMatch[1].toUpperCase()];
  }

  // Match: Req Humidity Damp
  const humidMatch = reqStr.match(/Req\s+Humidity\s+(\w+)/i);
  if (humidMatch) {
    conditions.humidity = [humidMatch[1].toUpperCase()];
  }

  // Match: Req Biome Hell
  const biomeMatch = reqStr.match(/Req\s+Biome\s+(\w+)/i);
  if (biomeMatch) {
    conditions.biome = [biomeMatch[1]];
  }

  // Match: Req Block B:wool@1
  const blockMatch = reqStr.match(/Req\s+Block\s+(\S+)/i);
  if (blockMatch) {
    conditions.block = [blockMatch[1]];
  }

  return conditions;
}

/**
 * Main export function
 * @param {string} configPath - Path to the config file
 * @param {string} modName - Name of the mod (default: auto-detect from path)
 */
function parseGendustryConfig(configPath, modName = null) {
  try {
    // Auto-detect mod name from file path if not provided
    if (!modName) {
      if (configPath.includes("meatball_bees.cfg")) {
        modName = "MeatballCraft";
      } else {
        modName = "Gendustry";
      }
    }

    console.log(`Parsing Gendustry config: ${configPath}`);
    const result = parseGendustryConfigFile(configPath, modName);
    console.log(
      `Parsed ${Object.keys(result.bees).length} bees, ${
        result.mutations.length
      } mutations, ${Object.keys(result.branches).length} branches`
    );
    return result;
  } catch (error) {
    console.error(`Error parsing Gendustry config: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

module.exports = { parseGendustryConfig };

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

  const result = parseGendustryConfig(inputPath);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
