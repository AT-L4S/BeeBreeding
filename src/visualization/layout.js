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

  // Separate generation 0 nodes into childless and with-children
  const gen0Nodes = nodes.filter((n) => n.generation === 0);
  const gen0Childless = gen0Nodes.filter((n) => n.children.length === 0);
  const gen0WithChildren = gen0Nodes.filter((n) => n.children.length > 0);

  // Calculate cumulative X positions with dynamic spacing
  const generationXPositions = new Map();

  // Main tree starts at X=0
  generationXPositions.set(0, 0);

  for (let gen = 0; gen < maxGeneration; gen++) {
    const currentX = generationXPositions.get(gen);
    const spacing = calculateDynamicXSpacing(nodes, gen);
    generationXPositions.set(gen + 1, currentX + spacing);
  }

  // Calculate negative generation positions for childless gen0 bees
  // Determine how many columns needed
  const generationCounts = d3.rollup(
    nodes.filter((n) => n.children.length > 0),
    (v) => v.length,
    (d) => d.generation
  );
  const maxNodesPerGen = Math.max(...Array.from(generationCounts.values()), 15);
  const nodesPerColumn = maxNodesPerGen;

  const numChildlessColumns = Math.ceil(gen0Childless.length / nodesPerColumn);

  // Calculate spacing backwards from generation 0
  // Use average spacing from forward generations for consistency
  const avgSpacing = calculateDynamicXSpacing(nodes, 0);

  for (let i = 1; i <= numChildlessColumns; i++) {
    generationXPositions.set(-i, -i * avgSpacing);
  }

  // Sort childless generation 0 bees by name
  gen0Childless.sort((a, b) => {
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  // Position childless gen0 bees in columns as negative generations
  // Distribute nodes evenly across columns to balance them
  const baseNodesPerCol = Math.floor(gen0Childless.length / numChildlessColumns);
  const extraNodes = gen0Childless.length % numChildlessColumns;

  // Calculate how many nodes in each column (distribute extras to first columns)
  const nodesPerColumnArray = [];
  for (let col = 0; col < numChildlessColumns; col++) {
    nodesPerColumnArray[col] = baseNodesPerCol + (col < extraNodes ? 1 : 0);
  }

  // Assign nodes to columns based on balanced distribution
  let currentIndex = 0;
  for (let col = 0; col < numChildlessColumns; col++) {
    const nodesInThisColumn = nodesPerColumnArray[col];

    for (let row = 0; row < nodesInThisColumn; row++) {
      const node = gen0Childless[currentIndex];

      // Position at negative generation (-1, -2, -3, etc.)
      node.x = generationXPositions.get(-(col + 1));

      // Center each column independently based on actual node count in that column
      node.y = (row - (nodesInThisColumn - 1) / 2) * config.ySpacing + 400;

      currentIndex++;
    }
  }

  // Position all other nodes (including gen0 with children)
  nodes.forEach((node) => {
    // Skip gen0 childless nodes (already positioned)
    if (node.generation === 0 && node.children.length === 0) {
      return;
    }

    const genNodes = generationGroups.get(node.generation);

    // Filter out childless nodes from gen0 for sorting
    const nodesToSort =
      node.generation === 0
        ? genNodes.filter((n) => n.children.length > 0)
        : genNodes;

    // Sort nodes by number of children (descending)
    const sortedByChildren = nodesToSort
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

    // Only update position if node is in the reordered list
    if (nodeIndex !== -1) {
      node.x = generationXPositions.get(node.generation);
      node.y = (nodeIndex - (reordered.length - 1) / 2) * config.ySpacing + 400;
    }
  });

  return nodes;
}

function positionColumnLayout(nodes) {
  const maxGeneration = Math.max(...nodes.map((n) => n.generation));
  const leafsPerColumn = 15; // Adjust this for density

  // Separate ALL childless nodes and non-leaf nodes
  const allChildless = nodes.filter((n) => n.children.length === 0);
  const nonLeafNodes = nodes.filter((n) => n.children.length > 0);

  // Calculate cumulative X positions for non-leaf generations (start at 0)
  const generationXPositions = new Map();
  generationXPositions.set(0, 0);

  for (let gen = 0; gen < maxGeneration; gen++) {
    const currentX = generationXPositions.get(gen);
    const spacing = calculateDynamicXSpacing(nodes, gen);
    generationXPositions.set(gen + 1, currentX + spacing);
  }

  // Calculate column height for childless nodes
  // Find tallest column in the tree
  const generationCounts = d3.rollup(
    nonLeafNodes,
    (v) => v.length,
    (d) => d.generation
  );
  const maxNodesPerGen = Math.max(...Array.from(generationCounts.values()), 10);
  const nodesPerColumn = Math.max(10, maxNodesPerGen); // Min 10, max = tallest tree column

  // Sort all childless nodes by generation, then by name
  allChildless.sort((a, b) => {
    if (a.generation !== b.generation) {
      return a.generation - b.generation;
    }
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  // Position childless columns: tree end + 1 column width space + childless columns
  const columnWidth = 150;
  const columnGap = columnWidth; // Exactly 1 column width of space
  const childlessColumnStartX =
    generationXPositions.get(maxGeneration) + columnGap;

  // Position childless nodes in columns
  allChildless.forEach((node, index) => {
    const columnIndex = Math.floor(index / nodesPerColumn);
    const rowIndex = index % nodesPerColumn;

    node.x = childlessColumnStartX + columnIndex * columnWidth;
    node.y = (rowIndex - (nodesPerColumn - 1) / 2) * config.ySpacing + 400;
  });

  // Position non-leaf nodes (including gen0 with children) with center-weighted sorting
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

    if (nodeIndex !== -1) {
      node.x = generationXPositions.get(node.generation);
      node.y = (nodeIndex - (reordered.length - 1) / 2) * config.ySpacing + 400;
    }
  });

  // No need to position leaf nodes separately - they're already positioned above

  return nodes;
}
