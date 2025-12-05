/**
 * Layout algorithms for bee breeding tree visualization
 */
import { config } from "../core/config.js";

export function positionNodes(nodes, layoutMode = config.layoutModes.SPLIT) {
  if (layoutMode === config.layoutModes.COLUMN) {
    return positionColumnLayout(nodes);
  } else {
    return positionSplitLayout(nodes);
  }
}

function calculateDynamicXSpacing(nodes, generation) {
  const currentGenNodes = nodes.filter((n) => n.generation === generation);
  const nextGenNodes = nodes.filter((n) => n.generation === generation + 1);

  const maxCurrentWidth =
    currentGenNodes.length > 0
      ? Math.max(...currentGenNodes.map((n) => n.width || 100))
      : 100;
  const maxNextWidth =
    nextGenNodes.length > 0
      ? Math.max(...nextGenNodes.map((n) => n.width || 100))
      : 100;

  const straightSegments = config.straightLength * 2;
  const gap = config.gap;

  return maxCurrentWidth / 2 + straightSegments + gap + maxNextWidth / 2;
}

function positionSplitLayout(nodes) {
  const generationGroups = d3.group(nodes, (d) => d.generation);
  const maxGeneration = Math.max(...nodes.map((n) => n.generation));

  // Calculate cumulative X positions with dynamic spacing
  const generationXPositions = new Map();
  generationXPositions.set(0, 0);

  for (let gen = 0; gen < maxGeneration; gen++) {
    const currentX = generationXPositions.get(gen);
    const spacing = calculateDynamicXSpacing(nodes, gen);
    generationXPositions.set(gen + 1, currentX + spacing);
  }

  nodes.forEach((node) => {
    const genNodes = generationGroups.get(node.generation);
    const leafNodes = genNodes.filter((n) => n.children.length === 0);
    const nonLeafNodes = genNodes.filter((n) => n.children.length > 0);

    let finalIndex;
    let finalSize;

    if (node.children.length === 0) {
      // This is a leaf node - split above and below
      const leafIndex = leafNodes.indexOf(node);
      const halfLeaves = Math.floor(leafNodes.length / 2);

      if (leafIndex < halfLeaves) {
        // Top half of leaves (above non-leaves)
        finalIndex = leafIndex;
      } else {
        // Bottom half of leaves (below non-leaves) - extra leaf goes below
        finalIndex =
          halfLeaves + nonLeafNodes.length + (leafIndex - halfLeaves);
      }
      finalSize = genNodes.length;
    } else {
      // This is a non-leaf node - goes in middle
      const nonLeafIndex = nonLeafNodes.indexOf(node);
      const halfLeaves = Math.floor(leafNodes.length / 2);
      finalIndex = halfLeaves + nonLeafIndex;
      finalSize = genNodes.length;
    }

    node.x = generationXPositions.get(node.generation);
    node.y = (finalIndex - (finalSize - 1) / 2) * config.ySpacing + 400;
  });

  return nodes;
}

function positionColumnLayout(nodes) {
  const maxGeneration = Math.max(...nodes.map((n) => n.generation));
  const leafsPerColumn = 15; // Adjust this for density

  // Separate leaf and non-leaf nodes
  const leafNodes = nodes.filter((n) => n.children.length === 0);
  const nonLeafNodes = nodes.filter((n) => n.children.length > 0);

  // Calculate cumulative X positions for non-leaf generations
  const generationXPositions = new Map();
  generationXPositions.set(0, 0);

  for (let gen = 0; gen < maxGeneration; gen++) {
    const currentX = generationXPositions.get(gen);
    const spacing = calculateDynamicXSpacing(nodes, gen);
    generationXPositions.set(gen + 1, currentX + spacing);
  }

  const leafColumnStartX = generationXPositions.get(maxGeneration) + 200;

  // Position non-leaf nodes normally
  const nonLeafGenerationGroups = d3.group(nonLeafNodes, (d) => d.generation);
  nonLeafNodes.forEach((node) => {
    const genNodes = nonLeafGenerationGroups.get(node.generation);
    const genIndex = genNodes.indexOf(node);
    const genSize = genNodes.length;

    node.x = generationXPositions.get(node.generation);
    node.y = (genIndex - (genSize - 1) / 2) * config.ySpacing + 400;
  });

  // Sort leaves by their original generation (leftmost first)
  leafNodes.sort((a, b) => a.generation - b.generation);

  // Position leaf nodes in columns
  leafNodes.forEach((node, index) => {
    const columnIndex = Math.floor(index / leafsPerColumn);
    const rowIndex = index % leafsPerColumn;

    node.x = leafColumnStartX + columnIndex * 150; // 150px between columns
    node.y = (rowIndex - (leafsPerColumn - 1) / 2) * config.ySpacing + 400;
  });

  return nodes;
}
