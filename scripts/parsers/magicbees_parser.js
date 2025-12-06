/**
 * MagicBees EnumBeeSpecies.java Parser
 *
 * Parses MagicBees' EnumBeeSpecies.java file to extract bee species,
 * mutations, and branch information into the intermediate JSON format.
 *
 * MagicBees uses an enum-based pattern similar to Forestry and ExtraBees.
 */

const fs = require("fs");
const path = require("path");

/**
 * Parse MagicBees EnumBeeSpecies.java file
 * @param {string} filePath - Path to EnumBeeSpecies.java
 * @returns {Object} Intermediate format object with bees, mutations, and branches
 */
function parseMagicBeesSpecies(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  const result = {
    bees: {},
    mutations: [],
    branches: {},
  };

  // Extract enum constants
  // Pattern: ENUMNAME(Branch.BRANCH, "binomial", dominant, new Color(0xHEX), new Color(0xHEX)) { body },
  const enumPattern =
    /(\w+)\s*\(\s*Branch\.(\w+)\s*,\s*"([^"]+)"\s*,\s*(true|false)\s*,\s*new\s+Color\s*\(\s*0x([0-9A-Fa-f]+)\s*\)\s*,\s*new\s+Color\s*\(\s*0x([0-9A-Fa-f]+)\s*\)\s*\)\s*\{([^}]*)\}/g;

  let match;
  while ((match = enumPattern.exec(content)) !== null) {
    const [
      ,
      enumName,
      branch,
      binomial,
      dominant,
      primaryColor,
      secondaryColor,
      body,
    ] = match;

    const uid = `magicbees.species${
      enumName.charAt(0) + enumName.slice(1).toLowerCase()
    }`;

    const bee = {
      mod: "MagicBees",
      name:
        enumName.charAt(0) + enumName.slice(1).toLowerCase().replace(/_/g, " "),
      binomial: binomial,
      branch: `magicbees:${branch.toLowerCase()}`,
      dominant: dominant === "true",
      colors: {
        primary: `#${primaryColor.toUpperCase()}`,
        secondary: `#${secondaryColor.toUpperCase()}`,
      },
      temperature: "NORMAL",
      humidity: "NORMAL",
      hasEffect: false,
      isSecret: false,
      products: [],
    };

    // Parse bee body for details
    const bodyDetails = parseBeeBody(body);
    if (bodyDetails.temperature) bee.temperature = bodyDetails.temperature;
    if (bodyDetails.humidity) bee.humidity = bodyDetails.humidity;
    if (bodyDetails.hasEffect) bee.hasEffect = bodyDetails.hasEffect;
    if (bodyDetails.isSecret) bee.isSecret = bodyDetails.isSecret;
    if (bodyDetails.products.length > 0) bee.products = bodyDetails.products;

    result.bees[uid] = bee;

    // Store enum name for mutation parsing
    result.bees[uid]._enumName = enumName;
  }

  // Parse mutations from registerMutations() method
  const mutations = parseMutations(content, result.bees);
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
 * Parse bee body for additional details
 */
function parseBeeBody(body) {
  const details = {
    temperature: null,
    humidity: null,
    hasEffect: false,
    isSecret: false,
    products: [],
  };

  // Temperature: setTemperature(EnumTemperature.XXX)
  const tempMatch = body.match(/setTemperature\s*\(\s*EnumTemperature\.(\w+)/);
  if (tempMatch) {
    details.temperature = tempMatch[1];
  }

  // Humidity: setHumidity(EnumHumidity.XXX)
  const humidMatch = body.match(/setHumidity\s*\(\s*EnumHumidity\.(\w+)/);
  if (humidMatch) {
    details.humidity = humidMatch[1];
  }

  // Effect: setHasEffect()
  if (body.includes("setHasEffect()")) {
    details.hasEffect = true;
  }

  // Secret: setIsSecret()
  if (body.includes("setIsSecret()")) {
    details.isSecret = true;
  }

  // Products: addProduct(item, chance)
  const productPattern = /addProduct\s*\(\s*([^,]+)\s*,\s*([\\d.]+)f?\s*\)/g;
  let productMatch;
  while ((productMatch = productPattern.exec(body)) !== null) {
    const [, item, chance] = productMatch;
    details.products.push({
      item: parseItemReference(item),
      chance: parseFloat(chance),
    });
  }

  // Specialties: addSpecialty(item, chance)
  const specialtyPattern =
    /addSpecialty\s*\(\s*([^,]+)\s*,\s*([\\d.]+)f?\s*\)/g;
  let specialtyMatch;
  while ((specialtyMatch = specialtyPattern.exec(body)) !== null) {
    const [, item, chance] = specialtyMatch;
    details.products.push({
      item: parseItemReference(item),
      chance: parseFloat(chance),
    });
  }

  return details;
}

/**
 * Parse item reference to a readable format
 */
function parseItemReference(itemRef) {
  itemRef = itemRef.trim();

  // MagicBees combs: Config.combs.get(EnumCombType.TYPE)
  const combMatch = itemRef.match(
    /Config\.combs\.get\s*\(\s*EnumCombType\.(\w+)/
  );
  if (combMatch) {
    return `magicbees:comb.${combMatch[1].toLowerCase()}`;
  }

  // Vanilla items: Items.XXX
  const itemMatch = itemRef.match(/Items\.(\w+)/);
  if (itemMatch) {
    return `minecraft:${itemMatch[1].toLowerCase()}`;
  }

  // Direct item references
  return itemRef;
}

/**
 * Parse mutations from registerMutations() or similar method
 */
function parseMutations(content, bees) {
  const mutations = [];

  // Extract mutation registration section
  const mutationMatch = content.match(
    /(?:registerMutations|private\s+void\s+\w*[Mm]utation\w*)\s*\([^)]*\)\s*\{([\s\S]*?)(?:\n\s*\}|\n\s*private|\n\s*public)/
  );
  if (!mutationMatch) {
    console.warn("Could not find mutation registration method");
    return mutations;
  }

  const mutationBody = mutationMatch[1];

  // Pattern: registerMutation(PARENT1, PARENT2, OFFSPRING, CHANCE, [conditions]);
  const mutationPattern =
    /registerMutation\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+(?:\[\d+\])?)\s*,\s*([\\d.]+)f?\s*(?:,\s*([^)]+))?\)/g;

  let match;
  while ((match = mutationPattern.exec(mutationBody)) !== null) {
    const [, parent1, parent2, offspring, chance, conditions] = match;

    const mutation = {
      parent1: resolveSpeciesReference(parent1, bees),
      parent2: resolveSpeciesReference(parent2, bees),
      offspring: resolveSpeciesReference(
        offspring.replace(/\[\d+\]/, ""),
        bees
      ),
      chance: parseFloat(chance),
    };

    // Parse conditions
    if (conditions) {
      const parsedConditions = parseConditions(conditions);
      if (Object.keys(parsedConditions).length > 0) {
        mutation.conditions = parsedConditions;
      }
    }

    mutations.push(mutation);
  }

  return mutations;
}

/**
 * Parse mutation conditions
 */
function parseConditions(condStr) {
  const conditions = {};

  // Temperature requirement: requireTemp(EnumTemperature.XXX)
  const tempMatch = condStr.match(/requireTemp\s*\(\s*EnumTemperature\.(\w+)/);
  if (tempMatch) {
    conditions.temperature = tempMatch[1];
  }

  // Biome requirement: restrictBiomeType(BiomeType.XXX)
  const biomeMatch = condStr.match(/restrictBiomeType\s*\(\s*BiomeType\.(\w+)/);
  if (biomeMatch) {
    conditions.biome = [biomeMatch[1].toLowerCase()];
  }

  // Block requirement: requireBlock(Blocks.XXX)
  const blockMatch = condStr.match(/requireBlock\s*\(\s*Blocks\.(\w+)/);
  if (blockMatch) {
    conditions.block = [`minecraft:${blockMatch[1].toLowerCase()}`];
  }

  // Dimension requirement: restrictDimension(id)
  const dimMatch = condStr.match(/restrictDimension\s*\(\s*(-?\d+)/);
  if (dimMatch) {
    conditions.dimension = parseInt(dimMatch[1]);
  }

  // Moon phase restriction: new MoonPhaseMutationRestriction(MoonPhase.XXX) or (MoonPhase.START, MoonPhase.END)
  const moonPhaseMatch = condStr.match(
    /MoonPhaseMutationRestriction\s*\(\s*MoonPhase\.(\w+)(?:\s*,\s*MoonPhase\.(\w+))?\s*\)/
  );
  if (moonPhaseMatch) {
    const [, phase1, phase2] = moonPhaseMatch;
    if (phase2 && phase2 !== phase1) {
      conditions.moonPhase = [phase1, phase2];
    } else {
      conditions.moonPhase = [phase1];
    }
  }

  // Moon phase bonus: new MoonPhaseMutationBonus(MoonPhase.XXX, MoonPhase.XXX, bonus)
  // Note: We capture this as a condition but it's actually a chance multiplier
  const moonBonusMatch = condStr.match(
    /MoonPhaseMutationBonus\s*\(\s*MoonPhase\.(\w+)\s*,\s*MoonPhase\.(\w+)\s*,\s*[\d.]+f?\s*\)/
  );
  if (moonBonusMatch) {
    const [, phase1, phase2] = moonBonusMatch;
    if (!conditions.moonPhase) {
      conditions.moonPhase = phase1 === phase2 ? [phase1] : [phase1, phase2];
    }
  }

  return conditions;
}

/**
 * Resolve species reference (enum name to UID)
 */
function resolveSpeciesReference(ref, bees) {
  ref = ref.trim();

  // Look up in MagicBees species
  for (const [uid, bee] of Object.entries(bees)) {
    if (bee._enumName === ref) {
      return uid;
    }
  }

  // Check for Forestry bee references
  // Pattern: BeeDefinition.COMMON or similar
  if (ref.match(/^[A-Z_]+$/)) {
    const name = ref.charAt(0) + ref.slice(1).toLowerCase();
    return `forestry.species${name}`;
  }

  // Check for ExtraBees references
  // Pattern: ExtraBeeDefinition.XXX
  const extraBeesMatch = ref.match(/ExtraBeeDefinition\.(\w+)/);
  if (extraBeesMatch) {
    const name =
      extraBeesMatch[1].charAt(0) + extraBeesMatch[1].slice(1).toLowerCase();
    return `extrabees.species.${name}`;
  }

  return ref;
}

/**
 * Main export function
 */
function parseMagicBees(javaFilePath) {
  try {
    console.log(`Parsing MagicBees EnumBeeSpecies: ${javaFilePath}`);
    const result = parseMagicBeesSpecies(javaFilePath);
    console.log(
      `Parsed ${Object.keys(result.bees).length} bees, ${
        result.mutations.length
      } mutations, ${Object.keys(result.branches).length} branches`
    );
    return result;
  } catch (error) {
    console.error(`Error parsing MagicBees EnumBeeSpecies: ${error.message}`);
    throw error;
  }
}

module.exports = { parseMagicBees };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(
      "Usage: node magicbees_parser.js <path-to-EnumBeeSpecies.java> [output-json-file]"
    );
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];

  const result = parseMagicBees(inputPath);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
