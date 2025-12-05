/**
 * Data loader for bee breeding tree visualization
 * Handles loading and processing of bee data
 */

/**
 * Strip comments from JSON text using jsonc-parser library
 * Supports single-line comments (//) and multi-line comments
 */
function stripJsonComments(jsonText) {
  // Use the jsonc-parser library's stripComments function if available
  if (window.jsoncparser && window.jsoncparser.stripComments) {
    return window.jsoncparser.stripComments(jsonText);
  }

  // Fallback to basic regex if library not available
  let result = jsonText.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result.replace(/([^:])\/\/.*$/gm, "$1");
  return result;
}

export async function loadBeeData() {
  try {
    // Determine base path based on protocol
    const basePath = window.location.protocol === "file:" ? "/data/" : "data/";
    
    // Load data from JSONC files (JSON with comments)
    const [beesResponse, breedingPairsResponse] = await Promise.all([
      fetch(`${basePath}bees.jsonc`),
      fetch(`${basePath}breeding_pairs.jsonc`),
    ]);

    // Get text content and strip comments before parsing
    const beesText = await beesResponse.text();
    const breedingPairsText = await breedingPairsResponse.text();

    const beesData = JSON.parse(stripJsonComments(beesText));
    const breedingPairsData = JSON.parse(stripJsonComments(breedingPairsText));

    // Convert breeding pairs to the format expected by buildBeeData
    const rawMutations = convertBreedingPairsToMutations(
      breedingPairsData,
      beesData
    );

    return buildBeeData(rawMutations);
  } catch (error) {
    console.error("Error loading bee data:", error);
    // Fallback to hardcoded data if loading fails
    const rawMutations = {
      "Forestry:Abandoned": {
        parents: ["MagicBees:Oblivion", "MagicBees:Nameless"],
        mod: "MagicBees",
      },
      "ExtraBees:Abnormal": {
        parents: ["Ender", "Forestry:Secluded"],
        mod: "ExtraBees",
      },
      // ... (fallback data would be here)
      "CareerBees:Yente": {
        parents: ["CareerBees:Student", "CareerBees:Husbandry"],
        mod: "CareerBees",
      },
    };

    return buildBeeData(rawMutations);
  }
}

function convertBreedingPairsToMutations(breedingPairs, beesData) {
  const beeData = {};

  // Initialize all bees from beesData
  Object.entries(beesData).forEach(([beeId, beeInfo]) => {
    const beeParts = beeId.split(":");
    const mod = beeParts.length === 2 ? beeParts[0] : "Unknown";
    const name = beeParts.length === 2 ? beeParts[1] : beeId;

    beeData[beeId] = {
      id: beeId,
      name: name,
      mod: mod,
      parentCombinations: [], // Array of parent pair arrays
      children: [],
    };
  });

  // Process breeding pairs to add relationships
  breedingPairs.forEach((pair) => {
    const [parent1, parent2] = pair.parents;

    pair.children.forEach((child) => {
      const childId = child.species;

      // Ensure child exists (it should from bees.jsonc)
      if (!beeData[childId]) {
        const childParts = childId.split(":");
        const childMod = childParts.length === 2 ? childParts[0] : "Unknown";
        const childName = childParts.length === 2 ? childParts[1] : childId;

        beeData[childId] = {
          id: childId,
          name: childName,
          mod: childMod,
          parentCombinations: [],
          children: [],
        };
      }

      // Ensure parents exist
      if (!beeData[parent1]) {
        const p1Parts = parent1.split(":");
        beeData[parent1] = {
          id: parent1,
          name: p1Parts.length === 2 ? p1Parts[1] : parent1,
          mod: p1Parts.length === 2 ? p1Parts[0] : "Unknown",
          parentCombinations: [],
          children: [],
        };
      }
      if (!beeData[parent2]) {
        const p2Parts = parent2.split(":");
        beeData[parent2] = {
          id: parent2,
          name: p2Parts.length === 2 ? p2Parts[1] : parent2,
          mod: p2Parts.length === 2 ? p2Parts[0] : "Unknown",
          parentCombinations: [],
          children: [],
        };
      }

      // Add parent combination to child (make sure we store as array of two individual strings)
      if (!beeData[childId].parentCombinations) {
        beeData[childId].parentCombinations = [];
      }
      beeData[childId].parentCombinations.push([parent1, parent2]);

      // Add child to both parents' children arrays
      if (!beeData[parent1].children.includes(childId)) {
        beeData[parent1].children.push(childId);
      }
      if (!beeData[parent2].children.includes(childId)) {
        beeData[parent2].children.push(childId);
      }
    });
  });

  return beeData;
}

function buildBeeData(beeData) {
  // Data is already in the correct format from convertBreedingPairsToMutations
  return beeData;
}
