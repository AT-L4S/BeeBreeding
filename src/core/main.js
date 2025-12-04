/**
 * Main application for bee breeding tree visualization
 */
import { buildHierarchy } from "../data/beeProcessor.js";
import { loadBeeData } from "../data/dataLoader.js";
import { renderEdges } from "../visualization/edgeRenderer.js";
import { positionNodes } from "../visualization/layout.js";
import { renderNodes } from "../visualization/nodeRenderer.js";
import { config } from "./config.js";

export class BeeBreedingApp {
  constructor() {
    this.useColumnLayoutForLeaves = false;
    this.beeData = null;
    this.hierarchyData = null;
    this.nodes = [];
    this.links = [];
    this.nodeMap = new Map();
    this.nodeColors = {};
    this.linksByTarget = null;
    this.svg = null;
    this.g = null;
    this.link = null;
    this.node = null;
    this.zoom = null;
    this.isFilteredView = false;
    this.originalPositions = new Map();
    this.currentSelectedNode = null;
  }

  async initialize() {
    console.log("Initializing BeeBreedingApp...");

    try {
      // Load and process data
      this.beeData = await loadBeeData();
      console.log("Loaded bee data:", Object.keys(this.beeData).length, "bees");

      this.hierarchyData = buildHierarchy(this.beeData);
      this.nodes = this.hierarchyData.nodes;
      this.links = this.hierarchyData.links;
      this.nodeMap = this.hierarchyData.nodeMap;

      console.log(
        "Built hierarchy with",
        this.nodes.length,
        "nodes and",
        this.links.length,
        "links"
      );

      // Debug: Check if we have any nodes/links
      if (this.nodes.length === 0) {
        console.warn("WARNING: No nodes found in hierarchy!");
      }
      if (this.links.length === 0) {
        console.warn("WARNING: No links found in hierarchy!");
      }

      // Position nodes
      positionNodes(
        this.nodes,
        this.useColumnLayoutForLeaves
          ? config.layoutModes.COLUMN
          : config.layoutModes.SPLIT
      );

      // Assign colors intelligently after positions are calculated
      this.nodeColors = this.assignNodeColors(this.nodes, this.nodeMap);

      // Set up SVG
      this.setupSVG();

      // Debug: Check if SVG was set up correctly
      if (!this.svg || !this.g) {
        console.error("ERROR: SVG setup failed - no svg or g element");
        return;
      }

      // Render visualization
      this.renderVisualization();

      // Debug: Check if rendering created any elements
      if (!this.node || !this.link) {
        console.error("ERROR: Rendering failed - no nodes or links created");
        return;
      }

      // Set up zoom
      this.setupZoom();

      // Set up controls
      this.setupControls();

      // Set up search
      this.setupSearch();

      // Initial fit
      this.fitView();

      console.log("Initialization complete");
    } catch (error) {
      console.error("Error during initialization:", error);
      throw error;
    }
  }

  setupSVG() {
    const margin = {
      top: 100,
      right: 100,
      bottom: 100,
      left: 100,
    };
    const width = 1200;
    const height = 800;

    this.svg = d3
      .select("#tree-svg")
      .attr("width", "100%")
      .attr("height", "100vh")
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right} ${
          height + margin.top + margin.bottom
        }`
      );

    this.g = this.svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
  }

  renderVisualization() {
    // Calculate node widths BEFORE rendering edges
    this.nodes.forEach((node) => {
      const text = node.name || node.id;
      node.width = Math.max(100, text.toUpperCase().length * 8 + 30);
    });

    // Create linksByTarget map for border rendering
    this.linksByTarget = d3.group(this.links, (d) => d.target);

    // Render edges (now nodes have their widths set)
    const edgeResult = renderEdges(
      this.g,
      this.links,
      this.nodes,
      this.nodeMap,
      this.nodeColors
    );
    this.link = edgeResult.link;

    // Render nodes
    const nodeResult = renderNodes(
      this.g,
      this.nodes,
      this.links,
      this.nodeMap,
      this.nodeColors
    );
    this.node = nodeResult.node;

    // Set up node click handlers
    this.setupNodeInteractions();
  }

  setupNodeInteractions() {
    this.node.on("click", (event, d) => {
      event.stopPropagation();

      // Save the selected node
      this.currentSelectedNode = d;

      // Check if filter mode checkbox is checked
      const filterModeCheckbox = document.getElementById("filterModeToggle");
      const showAllNodes = filterModeCheckbox
        ? filterModeCheckbox.checked
        : true;

      if (showAllNodes) {
        // Default behavior: show all nodes, fade unrelated
        this.highlightConnections(d);
      } else {
        // Filtered view: show only related nodes with rearranged layout
        this.showFilteredView(d);
      }

      this.showInfo(d);
    });

    // Clear selection on background click
    this.svg.on("click", () => this.resetHighlight());
  }

  assignNodeColors(nodes, nodeMap) {
    const nodeColors = {};
    const conflicts = new Map();

    // Initialize conflict sets
    nodes.forEach((node) => {
      conflicts.set(node.id, new Set());
    });

    // Add parent-child conflicts
    nodes.forEach((node) => {
      node.parents.forEach((parentId) => {
        if (conflicts.has(parentId)) {
          conflicts.get(node.id).add(parentId);
          conflicts.get(parentId).add(node.id);
        }
      });
      node.children.forEach((childId) => {
        if (conflicts.has(childId)) {
          conflicts.get(node.id).add(childId);
          conflicts.get(childId).add(node.id);
        }
      });
    });

    // Add spatial proximity conflicts
    const proximityThreshold = 100;
    nodes.forEach((nodeA) => {
      nodes.forEach((nodeB) => {
        if (nodeA.id !== nodeB.id) {
          const distance = Math.sqrt(
            Math.pow(nodeA.x - nodeB.x, 2) + Math.pow(nodeA.y - nodeB.y, 2)
          );
          if (distance < proximityThreshold) {
            conflicts.get(nodeA.id).add(nodeB.id);
            conflicts.get(nodeB.id).add(nodeA.id);
          }
        }
      });
    });

    // Welsh-Powell graph coloring algorithm
    const sortedNodes = nodes
      .slice()
      .sort((a, b) => conflicts.get(b.id).size - conflicts.get(a.id).size);

    // Assign colors with diversity preference
    sortedNodes.forEach((node, nodeIndex) => {
      const usedColors = new Set();

      // Find colors used by conflicting nodes
      conflicts.get(node.id).forEach((conflictId) => {
        if (nodeColors[conflictId] !== undefined) {
          usedColors.add(nodeColors[conflictId]);
        }
      });

      // Create a preferred color based on generation and position for diversity
      const preferredColor =
        (node.generation * 3 + Math.abs(node.y) / 50) %
        config.availableColors.length;

      // Try preferred color first if available
      if (!usedColors.has(Math.floor(preferredColor))) {
        nodeColors[node.id] = Math.floor(preferredColor);
      } else {
        // Find first available color, but with some randomization for diversity
        let colorIndex = (nodeIndex * 7) % config.availableColors.length;
        let attempts = 0;

        while (
          usedColors.has(colorIndex) &&
          attempts < config.availableColors.length
        ) {
          colorIndex = (colorIndex + 1) % config.availableColors.length;
          attempts++;
        }

        // If we run out of colors, use fallback with node-specific offset
        if (attempts >= config.availableColors.length) {
          colorIndex =
            Math.abs(
              node.id.split("").reduce((a, b) => {
                a = (a << 5) - a + b.charCodeAt(0);
                return a & a;
              }, 0)
            ) % config.availableColors.length;
        }

        nodeColors[node.id] = colorIndex;
      }
    });

    return nodeColors;
  }

  getAllAncestors(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return new Set();
    visited.add(nodeId);

    const ancestors = new Set();
    const node = this.nodeMap.get(nodeId);
    if (node && node.parents) {
      node.parents.forEach((parentId) => {
        ancestors.add(parentId);
        const parentAncestors = this.getAllAncestors(
          parentId,
          new Set(visited)
        );
        parentAncestors.forEach((ancestor) => ancestors.add(ancestor));
      });
    }
    return ancestors;
  }

  getAllDescendants(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return new Set();
    visited.add(nodeId);

    const descendants = new Set();
    const node = this.nodeMap.get(nodeId);
    if (node && node.children) {
      node.children.forEach((childId) => {
        descendants.add(childId);
        const childDescendants = this.getAllDescendants(
          childId,
          new Set(visited)
        );
        childDescendants.forEach((descendant) => descendants.add(descendant));
      });
    }
    return descendants;
  }

  highlightConnections(selectedNode) {
    // Reset highlighting and fading
    this.node.classed("highlighted connected faded", false);
    this.link.classed("highlighted faded", false);

    // Remove any existing outer selection borders
    this.node.selectAll(".outer-selection-border").remove();

    // Reset ALL node borders to their default colors
    this.resetNodeBorders();

    // Highlight selected node
    this.node
      .filter((d) => d.id === selectedNode.id)
      .classed("highlighted", true);

    // Add red outline outside the existing colored borders
    this.addSelectionBorder(selectedNode);

    // Recursively collect ALL ancestors and descendants
    const allAncestors = this.getAllAncestors(selectedNode.id);
    const allDescendants = this.getAllDescendants(selectedNode.id);

    // Collect connected node IDs
    const connectedIds = new Set([selectedNode.id]);
    allAncestors.forEach((id) => connectedIds.add(id));
    allDescendants.forEach((id) => connectedIds.add(id));

    // Highlight connected nodes
    this.node
      .filter((d) => allAncestors.has(d.id) || allDescendants.has(d.id))
      .classed("connected", true);

    // Fade out unconnected nodes
    this.node.filter((d) => !connectedIds.has(d.id)).classed("faded", true);

    // Highlight relevant links
    const highlightedLinks = this.link.filter(
      (d) => connectedIds.has(d.source) && connectedIds.has(d.target)
    );

    highlightedLinks.classed("highlighted", true);

    // Fade non-highlighted links
    this.link
      .filter(
        (d) => !(connectedIds.has(d.source) && connectedIds.has(d.target))
      )
      .classed("faded", true);

    // Move highlighted links to end of link group
    highlightedLinks.each(function () {
      this.g.node().appendChild(this);
    });

    // Ensure connected nodes stay in node group
    this.node
      .filter(
        (d) =>
          allAncestors.has(d.id) ||
          allDescendants.has(d.id) ||
          d.id === selectedNode.id
      )
      .each(function () {
        this.g.node().appendChild(this);
      });
  }

  resetNodeBorders() {
    const app = this;
    this.node.each(function (d) {
      const nodeElement = d3.select(this);
      const inputLinks = app.linksByTarget.get(d.id) || [];

      if (inputLinks.length === 0) {
        nodeElement.selectAll(".node-border").attr("stroke", "#000");
      } else if (inputLinks.length === 1) {
        const edgeColor =
          config.availableColors[app.nodeColors[inputLinks[0].source] || 0];
        nodeElement
          .selectAll(".node-border, .node-border-segment")
          .attr("stroke", edgeColor);
      } else {
        // Multiple inputs - restore segment colors
        const sortedLinks = inputLinks
          .map((link) => {
            return {
              link,
              sourceY: app.nodeMap.get(link.source).y,
            };
          })
          .sort((a, b) => a.sourceY - b.sourceY)
          .map((item, index) => {
            let targetYOffset = 0;
            if (inputLinks.length > 1) {
              const spacing = config.spacing;
              const totalHeight = (inputLinks.length - 1) * spacing;
              targetYOffset = index * spacing - totalHeight / 2;
            }
            return {
              link: item.link,
              offset: targetYOffset,
              index,
            };
          });

        // Find the colors based on actual spatial position
        const topLinks = sortedLinks.filter((item) => item.offset < 0);
        const bottomLinks = sortedLinks.filter((item) => item.offset >= 0);

        const topColor =
          topLinks.length > 0
            ? config.availableColors[
                app.nodeColors[topLinks[topLinks.length - 1].link.source] || 0
              ]
            : config.availableColors[
                app.nodeColors[sortedLinks[0].link.source] || 0
              ];
        const bottomColor =
          bottomLinks.length > 0
            ? config.availableColors[
                app.nodeColors[bottomLinks[0].link.source] || 0
              ]
            : config.availableColors[
                app.nodeColors[
                  sortedLinks[sortedLinks.length - 1].link.source
                ] || 0
              ];

        const segments = nodeElement.selectAll(".node-border-segment").nodes();
        if (segments.length >= 4) {
          d3.select(segments[0]).attr("stroke", topColor);
          d3.select(segments[1]).attr("stroke", bottomColor);
          d3.select(segments[2]).attr("stroke", "#ddd");
          d3.select(segments[3]).attr("stroke", "#ddd");
        }
      }
    });
  }

  addSelectionBorder(selectedNode) {
    this.node
      .filter((d) => d.id === selectedNode.id)
      .each(function (d) {
        const nodeElement = d3.select(this);
        const halfWidth = d.width / 2;
        const borderOffset = 4.5;
        const outerHalfWidth = halfWidth + borderOffset;
        const outerHeight = 15 + borderOffset;
        const outerRx =
          config.borderRadiusX +
          (borderOffset * config.borderRadiusX) / halfWidth;
        const outerRy =
          config.borderRadiusY + (borderOffset * config.borderRadiusY) / 15;

        const outerBorderPath = `M${-outerHalfWidth + outerRx},-${outerHeight}
                                   L${outerHalfWidth - outerRx},-${outerHeight}
                                   Q${outerHalfWidth},-${outerHeight} ${outerHalfWidth},${
          -outerHeight + outerRy
        }
                                   L${outerHalfWidth},${outerHeight - outerRy}
                                   Q${outerHalfWidth},${outerHeight} ${
          outerHalfWidth - outerRx
        },${outerHeight}
                                   L${-outerHalfWidth + outerRx},${outerHeight}
                                   Q${-outerHalfWidth},${outerHeight} ${-outerHalfWidth},${
          outerHeight - outerRy
        }
                                   L${-outerHalfWidth},${-outerHeight + outerRy}
                                   Q${-outerHalfWidth},-${outerHeight} ${
          -outerHalfWidth + outerRx
        },-${outerHeight} Z`;

        nodeElement
          .append("path")
          .attr("d", outerBorderPath)
          .attr("stroke", "#ff4444")
          .attr("stroke-width", 6)
          .attr("fill", "none")
          .attr("class", "outer-selection-border");
      });
  }

  showInfo(selectedNode) {
    document.getElementById("selectedBee").textContent =
      selectedNode.name || selectedNode.id;
    document.getElementById("generation").textContent = selectedNode.generation;

    // Display parent combinations
    const parentsDiv = document.getElementById("parents");
    if (
      selectedNode.parentCombinations &&
      selectedNode.parentCombinations.length > 0
    ) {
      const parentText = selectedNode.parentCombinations
        .map((combo) =>
          combo
            .map((parentId) => {
              // Extract display name from mod-prefixed ID
              const parentNode = this.nodeMap.get(parentId);
              return parentNode
                ? parentNode.name || parentId.split(":")[1] || parentId
                : parentId;
            })
            .join(" + ")
        )
        .join(" OR ");
      parentsDiv.textContent = parentText;
    } else {
      parentsDiv.textContent = "None (Base species)";
    }

    // Display children with their display names
    const childrenText = selectedNode.children
      .map((childId) => {
        const childNode = this.nodeMap.get(childId);
        return childNode
          ? childNode.name || childId.split(":")[1] || childId
          : childId;
      })
      .join(", ");

    document.getElementById("children").textContent =
      childrenText || "None (Final evolution)";
    document.getElementById("infoPanel").style.display = "block";
  }

  resetHighlight() {
    // Clear current selection
    this.currentSelectedNode = null;

    // If we're in filtered view, restore original layout
    if (this.isFilteredView) {
      this.restoreOriginalView();
      return;
    }

    this.node.classed("highlighted connected faded", false);
    this.link.classed("highlighted faded", false);

    // Remove outer selection borders
    this.node.selectAll(".outer-selection-border").remove();

    // Reset all node borders to their default colors
    this.resetNodeBorders();

    document.getElementById("infoPanel").style.display = "none";
  }

  showFilteredView(selectedNode) {
    this.isFilteredView = true;

    // Disable layout toggle button
    const layoutButton = document.getElementById("layoutToggle");
    if (layoutButton) {
      layoutButton.disabled = true;
      layoutButton.style.opacity = "0.5";
      layoutButton.style.cursor = "not-allowed";
    }

    // Clear any previous highlights/classes
    this.node.classed("highlighted connected faded", false);
    this.link.classed("highlighted faded", false);
    this.node.selectAll(".outer-selection-border").remove();

    // Save original positions only if not already saved
    if (this.originalPositions.size === 0) {
      this.nodes.forEach((node) => {
        this.originalPositions.set(node.id, { x: node.x, y: node.y });
      });
    }

    // Collect related nodes
    const allAncestors = this.getAllAncestors(selectedNode.id);
    const allDescendants = this.getAllDescendants(selectedNode.id);
    const connectedIds = new Set([selectedNode.id]);
    allAncestors.forEach((id) => connectedIds.add(id));
    allDescendants.forEach((id) => connectedIds.add(id));

    // Filter nodes and links
    const filteredNodes = this.nodes.filter((n) => connectedIds.has(n.id));
    const filteredLinks = this.links.filter(
      (l) => connectedIds.has(l.source) && connectedIds.has(l.target)
    );

    // Rearrange filtered nodes for better readability
    this.arrangeFilteredNodes(filteredNodes, selectedNode);

    // Hide unrelated nodes and links
    this.node.style("display", (d) => (connectedIds.has(d.id) ? null : "none"));

    this.link.style("display", (d) =>
      connectedIds.has(d.source) && connectedIds.has(d.target) ? null : "none"
    );

    // Highlight the selected node
    this.node
      .filter((d) => d.id === selectedNode.id)
      .classed("highlighted", true);

    this.addSelectionBorder(selectedNode);

    // Highlight connected nodes
    this.node
      .filter((d) => allAncestors.has(d.id) || allDescendants.has(d.id))
      .classed("connected", true);

    // Update to new positions immediately
    this.node
      .filter((d) => connectedIds.has(d.id))
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Update link positions immediately
    this.link
      .filter((d) => connectedIds.has(d.source) && connectedIds.has(d.target))
      .attr("d", (d) => {
        const source = this.nodeMap.get(d.source);
        const target = this.nodeMap.get(d.target);
        const sourceWidth = source.width || 120;
        const targetWidth = target.width || 120;
        const targetY = target.y + (d.targetYOffset || 0);

        const sourceX = source.x + sourceWidth / 2;
        const targetX = target.x - targetWidth / 2 + 3;
        const sourceXStraight = sourceX + config.straightLength;
        const targetXStraight = targetX - config.straightLength;
        const controlX1 = sourceX + config.controlOffset;
        const controlX2 = targetX - config.controlOffset;

        return `M${sourceX},${source.y} L${sourceXStraight},${source.y} C${controlX1},${source.y} ${controlX2},${targetY} ${targetXStraight},${targetY} L${targetX},${targetY}`;
      });

    // Fit view to filtered nodes immediately
    this.fitViewToNodes(filteredNodes);
  }

  arrangeFilteredNodes(filteredNodes, selectedNode) {
    // Create a set of filtered node IDs for quick lookup
    const filteredIds = new Set(filteredNodes.map((n) => n.id));

    // Recalculate generations for filtered nodes
    // Base nodes = nodes whose parents aren't in the filtered set
    const filteredGenerations = new Map();
    const visited = new Set();

    // Find base nodes in the filtered set
    const baseBees = filteredNodes.filter((node) => {
      // A node is a base node if it has no parents OR all its parents are outside the filtered set
      if (!node.parents || node.parents.length === 0) return true;
      return !node.parents.some((parentId) => filteredIds.has(parentId));
    });

    // Set generation 0 for base nodes
    baseBees.forEach((bee) => {
      filteredGenerations.set(bee.id, 0);
      visited.add(bee.id);
    });

    // Iteratively assign generations based on parent relationships within filtered set
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 20) {
      iterations++;
      changed = false;

      filteredNodes.forEach((node) => {
        if (!visited.has(node.id) && node.parents && node.parents.length > 0) {
          // Find max generation among parents that are in the filtered set
          let maxParentGen = -1;
          let allFilteredParentsHaveGen = true;

          const filteredParents = node.parents.filter((p) =>
            filteredIds.has(p)
          );

          if (filteredParents.length === 0) {
            // No parents in filtered set, treat as base node
            filteredGenerations.set(node.id, 0);
            visited.add(node.id);
            changed = true;
          } else {
            for (const parentId of filteredParents) {
              if (!filteredGenerations.has(parentId)) {
                allFilteredParentsHaveGen = false;
                break;
              }
              maxParentGen = Math.max(
                maxParentGen,
                filteredGenerations.get(parentId)
              );
            }

            if (maxParentGen >= 0 && allFilteredParentsHaveGen) {
              filteredGenerations.set(node.id, maxParentGen + 1);
              visited.add(node.id);
              changed = true;
            }
          }
        }
      });
    }

    // Group nodes by their NEW filtered generations
    const generations = d3.group(
      filteredNodes,
      (d) => filteredGenerations.get(d.id) || 0
    );
    const sortedGens = Array.from(generations.keys()).sort((a, b) => a - b);

    // Position nodes generation by generation, preserving original vertical order
    sortedGens.forEach((gen, genIndex) => {
      const genNodes = generations.get(gen);
      const xPos = genIndex * config.xSpacing;

      // Sort by original Y position to maintain vertical order
      genNodes.sort((a, b) => {
        const origA = this.originalPositions.get(a.id);
        const origB = this.originalPositions.get(b.id);
        return (origA?.y || a.y) - (origB?.y || b.y);
      });

      // Add alternating vertical stagger between generations for clarity
      const staggerAmount = 30;
      const generationOffset =
        genIndex % 2 === 0
          ? -staggerAmount * Math.floor(genIndex / 2)
          : staggerAmount * Math.ceil(genIndex / 2);

      // Check if the selected node is in this generation
      const selectedNodeIndex = genNodes.findIndex(
        (n) => n.id === selectedNode.id
      );

      // Position nodes vertically, maintaining their relative order
      genNodes.forEach((node, i) => {
        node.x = xPos;

        if (node.id === selectedNode.id) {
          // Selected node is always centered at Y=400
          node.y = 400;
        } else {
          // Other nodes use normal spacing with stagger offset
          let baseY = 400 + generationOffset;

          // If selected node is in this generation, adjust positions around it
          if (selectedNodeIndex !== -1) {
            // Position relative to selected node
            const offsetFromSelected = i - selectedNodeIndex;
            node.y = 400 + offsetFromSelected * config.ySpacing;
          } else {
            // Normal positioning with stagger
            node.y = (i - (genNodes.length - 1) / 2) * config.ySpacing + baseY;
          }
        }
      });
    });
  }

  restoreOriginalView() {
    this.isFilteredView = false;

    // Re-enable layout toggle button
    const layoutButton = document.getElementById("layoutToggle");
    if (layoutButton) {
      layoutButton.disabled = false;
      layoutButton.style.opacity = "1";
      layoutButton.style.cursor = "pointer";
    }

    // Restore original positions
    this.nodes.forEach((node) => {
      const original = this.originalPositions.get(node.id);
      if (original) {
        node.x = original.x;
        node.y = original.y;
      }
    });

    // Clear saved positions so next filtered view saves fresh positions
    this.originalPositions.clear();

    // Show all nodes and links
    this.node
      .style("display", null)
      .classed("highlighted connected faded", false);

    this.link.style("display", null).classed("highlighted faded", false);

    // Remove outer selection borders
    this.node.selectAll(".outer-selection-border").remove();

    // Reset node borders
    this.resetNodeBorders();

    // Update back to original positions immediately
    this.node.attr("transform", (d) => `translate(${d.x},${d.y})`);

    this.link.attr("d", (d) => {
      const source = this.nodeMap.get(d.source);
      const target = this.nodeMap.get(d.target);
      const sourceWidth = source.width || 120;
      const targetWidth = target.width || 120;
      const targetY = target.y + (d.targetYOffset || 0);

      const sourceX = source.x + sourceWidth / 2;
      const targetX = target.x - targetWidth / 2 + 3;
      const sourceXStraight = sourceX + config.straightLength;
      const targetXStraight = targetX - config.straightLength;
      const controlX1 = sourceX + config.controlOffset;
      const controlX2 = targetX - config.controlOffset;

      return `M${sourceX},${source.y} L${sourceXStraight},${source.y} C${controlX1},${source.y} ${controlX2},${targetY} ${targetXStraight},${targetY} L${targetX},${targetY}`;
    });

    document.getElementById("infoPanel").style.display = "none";

    // Fit view immediately
    this.fitView();
  }

  fitViewToNodes(nodes) {
    // Calculate bounds for specific nodes
    const treeMinX = Math.min(...nodes.map((n) => n.x - (n.width || 100) / 2));
    const treeMaxX = Math.max(...nodes.map((n) => n.x + (n.width || 100) / 2));
    const treeMinY = Math.min(...nodes.map((n) => n.y));
    const treeMaxY = Math.max(...nodes.map((n) => n.y));

    const padding = 100;
    const treeWidth = treeMaxX - treeMinX + padding * 2;
    const treeHeight = treeMaxY - treeMinY + padding * 2;

    const svgWidth = 1200;
    const svgHeight = 800;

    const scaleX = (svgWidth - padding * 2) / treeWidth;
    const scaleY = (svgHeight - padding * 2) / treeHeight;
    const scale = Math.min(scaleX, scaleY, 1.2);

    const centerX = (treeMinX + treeMaxX) / 2;
    const centerY = (treeMinY + treeMaxY) / 2;
    const translateX = svgWidth / 2 - centerX * scale;
    const translateY = svgHeight / 2 - centerY * scale;

    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);

    this.svg.transition().duration(750).call(this.zoom.transform, transform);
  }

  fitView() {
    // Calculate proper bounds to fit all nodes
    const treeMinX = Math.min(
      ...this.nodes.map((n) => n.x - (n.width || 100) / 2)
    );
    const treeMaxX = Math.max(
      ...this.nodes.map((n) => n.x + (n.width || 100) / 2)
    );
    const treeMinY = Math.min(...this.nodes.map((n) => n.y));
    const treeMaxY = Math.max(...this.nodes.map((n) => n.y));

    const padding = 50;
    const treeWidth = treeMaxX - treeMinX + padding * 2;
    const treeHeight = treeMaxY - treeMinY + padding * 2;

    const svgWidth = 1200;
    const svgHeight = 800;

    // Calculate scale to fit both width and height with padding
    const scaleX = (svgWidth - padding * 2) / treeWidth;
    const scaleY = (svgHeight - padding * 2) / treeHeight;
    const scale = Math.min(scaleX, scaleY, 0.8);

    // Center the tree
    const centerX = (treeMinX + treeMaxX) / 2;
    const centerY = (treeMinY + treeMaxY) / 2;
    const translateX = svgWidth / 2 - centerX * scale;
    const translateY = svgHeight / 2 - centerY * scale;

    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);

    this.svg.transition().duration(750).call(this.zoom.transform, transform);
  }

  toggleLeafLayout() {
    this.useColumnLayoutForLeaves = !this.useColumnLayoutForLeaves;

    // Update button text
    const button = document.getElementById("layoutToggle");
    button.textContent = this.useColumnLayoutForLeaves
      ? "Switch to Split Layout"
      : "Switch to Column Layout";

    // Update positions with transitions
    positionNodes(
      this.nodes,
      this.useColumnLayoutForLeaves
        ? config.layoutModes.COLUMN
        : config.layoutModes.SPLIT
    );

    // Update nodes immediately
    this.node.attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Update links immediately
    this.link.attr("d", (d) => {
      const source = this.nodeMap.get(d.source);
      const target = this.nodeMap.get(d.target);
      const sourceWidth = source.width || 120;
      const targetWidth = target.width || 120;

      const targetY = target.y + d.targetYOffset;

      // Connect to the straight sides of rounded rectangles
      const sourceX = source.x + sourceWidth / 2;
      const targetX = target.x - targetWidth / 2 + 3;

      // Add straight segments
      const sourceXStraight = sourceX + config.straightLength;
      const targetXStraight = targetX - config.straightLength;

      // Create smoother control points
      const controlX1 = sourceX + config.controlOffset;
      const controlX2 = targetX - config.controlOffset;

      // Create path
      return `M${sourceX},${source.y} L${sourceXStraight},${source.y} C${controlX1},${source.y} ${controlX2},${targetY} ${targetXStraight},${targetY} L${targetX},${targetY}`;
    });

    // Fit view immediately
    this.fitView();
  }

  setupSearch() {
    document.getElementById("searchInput").addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase();
      if (searchTerm.length > 2) {
        const foundNode = this.nodes.find(
          (n) =>
            (n.name && n.name.toLowerCase().includes(searchTerm)) ||
            n.id.toLowerCase().includes(searchTerm)
        );
        if (foundNode) {
          this.highlightConnections(foundNode);
          this.showInfo(foundNode);
          // Gentle center on found node
          const currentTransform = d3.zoomTransform(this.svg.node());
          const nodeScreenX = currentTransform.applyX(foundNode.x);
          const nodeScreenY = currentTransform.applyY(foundNode.y);

          // Only pan if node is significantly off-screen
          if (
            nodeScreenX < 100 ||
            nodeScreenX > 1200 - 100 ||
            nodeScreenY < 100 ||
            nodeScreenY > 800 - 100
          ) {
            const transform = d3.zoomIdentity
              .translate(600 - foundNode.x, 400 - foundNode.y)
              .scale(currentTransform.k);
            this.svg
              .transition()
              .duration(500)
              .call(this.zoom.transform, transform);
          }
        }
      } else {
        this.resetHighlight();
      }
    });
  }

  setupControls() {
    console.log("Setting up controls...");

    // Bind global functions to app instance for HTML onclick handlers
    window.resetHighlight = () => this.resetHighlight();
    window.fitView = () => this.fitView();
    window.toggleLeafLayout = () => this.toggleLeafLayout();

    // Add checkbox change listener
    const filterModeCheckbox = document.getElementById("filterModeToggle");
    if (filterModeCheckbox) {
      filterModeCheckbox.addEventListener("change", () => {
        // If a node is selected, immediately switch visualization mode
        if (this.currentSelectedNode) {
          const showAllNodes = filterModeCheckbox.checked;

          if (showAllNodes) {
            // Switch to fade mode
            if (this.isFilteredView) {
              this.isFilteredView = false;

              // Restore original positions to node data
              this.nodes.forEach((node) => {
                const original = this.originalPositions.get(node.id);
                if (original) {
                  node.x = original.x;
                  node.y = original.y;
                }
              });

              // Clear saved positions
              this.originalPositions.clear();

              // Show all nodes and links
              this.node
                .style("display", null)
                .classed("highlighted connected faded", false);

              this.link
                .style("display", null)
                .classed("highlighted faded", false);

              // Update positions immediately without animation
              this.node.attr("transform", (d) => `translate(${d.x},${d.y})`);

              this.link.attr("d", (d) => {
                const source = this.nodeMap.get(d.source);
                const target = this.nodeMap.get(d.target);
                const sourceWidth = source.width || 120;
                const targetWidth = target.width || 120;
                const targetY = target.y + (d.targetYOffset || 0);

                const sourceX = source.x + sourceWidth / 2;
                const targetX = target.x - targetWidth / 2 + 3;
                const sourceXStraight = sourceX + config.straightLength;
                const targetXStraight = targetX - config.straightLength;
                const controlX1 = sourceX + config.controlOffset;
                const controlX2 = targetX - config.controlOffset;

                return `M${sourceX},${source.y} L${sourceXStraight},${source.y} C${controlX1},${source.y} ${controlX2},${targetY} ${targetXStraight},${targetY} L${targetX},${targetY}`;
              });

              // Apply fade highlighting immediately
              this.highlightConnections(this.currentSelectedNode);
              this.showInfo(this.currentSelectedNode);
            } else {
              // Already in normal view, just apply fade
              this.highlightConnections(this.currentSelectedNode);
            }
          } else {
            // Switch to filtered mode
            this.showFilteredView(this.currentSelectedNode);
            this.showInfo(this.currentSelectedNode);
          }
        }
      });
    }

    console.log("Controls bound to window object");
  }

  setupZoom() {
    console.log("Setting up zoom behavior...");
    this.zoom = d3
      .zoom()
      .scaleExtent(config.zoomScaleExtent)
      .on("zoom", (event) => {
        this.g.attr("transform", event.transform);
      });

    this.svg.call(this.zoom);
    console.log("Zoom behavior initialized");
  }
}
