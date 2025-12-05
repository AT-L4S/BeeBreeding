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

    // Sort nodes by number of children (descending)
    const sortedByChildren = genNodes
      .slice()
      .sort((a, b) => b.children.length - a.children.length);

    // Reorder so the most children are in the middle:
    // Alternate placing nodes: center, then alternating left/right
    const reordered = [];
    const isEven = sortedByChildren.length % 2 === 0;
    const mid = Math.floor(sortedByChildren.length / 2);

    for (let i = 0; i < sortedByChildren.length; i++) {
      let targetIndex;
      if (isEven) {
        // For even numbers: first at top-center (mid-1), second at bottom-center (mid)
        if (i === 0) {
          targetIndex = mid - 1;
        } else if (i === 1) {
          targetIndex = mid;
        } else if (i % 2 === 0) {
          // Even indices (2,4,6...) go above
          targetIndex = mid - 1 - i / 2;
        } else {
          // Odd indices (3,5,7...) go below
          // For i=3: (3-1)/2 = 1, so mid + 1
          // For i=5: (5-1)/2 = 2, so mid + 2
          targetIndex = mid + (i - 1) / 2;
        }
      } else {
        // For odd numbers: first at exact center
        if (i === 0) {
          targetIndex = mid;
        } else if (i % 2 === 1) {
          // Odd indices go above center
          targetIndex = mid - Math.ceil(i / 2);
        } else {
          // Even indices go below center
          targetIndex = mid + i / 2;
        }
      }
      reordered[targetIndex] = sortedByChildren[i];
    }

    const nodeIndex = reordered.indexOf(node);

    node.x = generationXPositions.get(node.generation);
    node.y = (nodeIndex - (reordered.length - 1) / 2) * config.ySpacing + 400;
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

  // Position non-leaf nodes with center-weighted sorting by children count
  const nonLeafGenerationGroups = d3.group(nonLeafNodes, (d) => d.generation);
  nonLeafNodes.forEach((node) => {
    const genNodes = nonLeafGenerationGroups.get(node.generation);

    // Sort nodes by number of children (descending)
    const sortedByChildren = genNodes
      .slice()
      .sort((a, b) => b.children.length - a.children.length);

    // Reorder so the most children are in the middle
    const reordered = [];
    const isEven = sortedByChildren.length % 2 === 0;
    const mid = Math.floor(sortedByChildren.length / 2);

    for (let i = 0; i < sortedByChildren.length; i++) {
      let targetIndex;
      if (isEven) {
        // For even numbers: first at top-center (mid-1), second at bottom-center (mid)
        if (i === 0) {
          targetIndex = mid - 1;
        } else if (i === 1) {
          targetIndex = mid;
        } else if (i % 2 === 0) {
          // Even indices (2,4,6...) go above
          targetIndex = mid - 1 - i / 2;
        } else {
          // Odd indices (3,5,7...) go below
          targetIndex = mid + (i - 1) / 2;
        }
      } else {
        // For odd numbers: first at exact center
        if (i === 0) {
          targetIndex = mid;
        } else if (i % 2 === 1) {
          // Odd indices go above center
          targetIndex = mid - Math.ceil(i / 2);
        } else {
          // Even indices go below center
          targetIndex = mid + i / 2;
        }
      }
      reordered[targetIndex] = sortedByChildren[i];
    }

    const nodeIndex = reordered.indexOf(node);

    node.x = generationXPositions.get(node.generation);
    node.y = (nodeIndex - (reordered.length - 1) / 2) * config.ySpacing + 400;
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
