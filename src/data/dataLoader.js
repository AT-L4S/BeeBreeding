/**
 * Data loader for bee breeding tree visualization
 * Handles loading and processing of bee data
 */

/**
 * Strip comments from JSON text using jsonc-parser library
 * Supports single-line comments (//) and multi-line comments
 */
function stripJsonComments(jsonText) {
  // Try different possible global names for jsonc-parser
  const jsoncLib = window.jsoncparser || window.jsonc || window.jsoncParser;
  if (jsoncLib && jsoncLib.stripComments) {
    console.log("Using jsonc-parser library for comment stripping");
    return jsoncLib.stripComments(jsonText);
  }

  console.log("Using fallback regex for comment stripping");
  // Fallback: process line by line to properly handle comments
  const lines = jsonText.split('\n');
  const result = [];
  let inMultiLineComment = false;

  for (let line of lines) {
    // Handle multi-line comments
    if (inMultiLineComment) {
      const endIndex = line.indexOf('*/');
      if (endIndex !== -1) {
        inMultiLineComment = false;
        line = line.substring(endIndex + 2);
      } else {
        continue; // Skip entire line if still in multi-line comment
      }
    }

    // Check for multi-line comment start
    const startIndex = line.indexOf('/*');
    if (startIndex !== -1) {
      const endIndex = line.indexOf('*/', startIndex + 2);
      if (endIndex !== -1) {
        // Comment starts and ends on same line
        line = line.substring(0, startIndex) + line.substring(endIndex + 2);
      } else {
        // Multi-line comment starts but doesn't end
        line = line.substring(0, startIndex);
        inMultiLineComment = true;
      }
    }

    // Remove single-line comments (// to end of line)
    // But be careful not to remove // inside strings
    const singleCommentIndex = line.indexOf('//');
    if (singleCommentIndex !== -1) {
      // Simple check: if // appears before any quotes, it's likely a comment
      const beforeComment = line.substring(0, singleCommentIndex);
      const quoteCount = (beforeComment.match(/"/g) || []).length;
      // If even number of quotes before //, it's outside strings
      if (quoteCount % 2 === 0) {
        line = beforeComment;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

export async function loadBeeData() {
  try {
    // Determine base path based on protocol
    const basePath = window.location.protocol === "file:" ? "/data/" : "data/";
    console.log("Loading bee data from:", basePath);

    // Load data from JSONC files (JSON with comments)
    const [beesResponse, breedingPairsResponse] = await Promise.all([
      fetch(`${basePath}bees.jsonc`),
      fetch(`${basePath}mutations.jsonc`),
    ]);

    console.log("Fetch responses:", beesResponse.status, breedingPairsResponse.status);

    if (!beesResponse.ok) {
      throw new Error(`Failed to load bees.jsonc: ${beesResponse.status} ${beesResponse.statusText}`);
    }
    if (!breedingPairsResponse.ok) {
      throw new Error(`Failed to load mutations.jsonc: ${breedingPairsResponse.status} ${breedingPairsResponse.statusText}`);
    }

    // Get text content and strip comments before parsing
    const beesText = await beesResponse.text();
    const breedingPairsText = await breedingPairsResponse.text();

    console.log("Loaded text sizes - bees:", beesText.length, "mutations:", breedingPairsText.length);

    const beesData = JSON.parse(stripJsonComments(beesText));
    const breedingPairsData = JSON.parse(stripJsonComments(breedingPairsText));

    console.log("Parsed data - bees:", Object.keys(beesData).length, "mutations:", breedingPairsData.length);

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
      "failedtoload:failedtoloadbees": {
        mod: "failedtoload",
        name: "FAILED TO LOAD BEES",
      },
    };

    return buildBeeData(rawMutations);
  }
}

function convertBreedingPairsToMutations(breedingPairs, beesData) {
  const beeData = {};

  // Initialize all bees from beesData
  Object.entries(beesData).forEach(([beeId, beeInfo]) => {
    beeData[beeId] = {
      id: beeId,
      name: beeInfo.name || beeId.split(":")[1] || beeId,
      mod: beeInfo.mod || "Unknown",
      parentCombinations: [], // Array of parent pair arrays
      children: [],
    };
  });

  // Process breeding pairs to add relationships
  breedingPairs.forEach((pair) => {
    const [parent1, parent2] = pair.parents;

    // Children is now an object keyed by species ID
    Object.entries(pair.children).forEach(([childId, childData]) => {
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
