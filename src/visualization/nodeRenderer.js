/**
 * Node rendering for bee breeding tree visualization
 */
import { config } from "/src/core/config.js";

export function renderNodes(svg, nodes, links, nodeMap, nodeColors) {
  // Function to estimate text width
  function getTextWidth(text) {
    return Math.max(100, text.toUpperCase().length * 8 + 30);
  }

  // Calculate and store width for each node
  nodes.forEach((node) => {
    node.width = getTextWidth(node.name || node.id);
  });

  // Group links by target to calculate input connection offsets
  const linksByTarget = d3.group(links, (d) => d.target);

  // Create nodes in the node group
  const nodeGroup = svg.append("g").attr("class", "nodes");

  const node = nodeGroup
    .selectAll(".node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", (d) => `translate(${d.x},${d.y})`);

  // Add rectangles with intelligently assigned colors - dynamic width for each node
  node
    .append("rect")
    .attr("width", (d) => d.width)
    .attr("height", config.nodeHeight)
    .attr("x", (d) => -d.width / 2)
    .attr("y", -config.nodeHeight / 2)
    .style("fill", (d) => {
      // Leaf nodes (no children) get black fill, others keep their assigned colors
      return d.children.length === 0
        ? "#000000"
        : config.availableColors[nodeColors[d.id] || 0];
    });

  // Add complete colored borders that match the rounded rectangle exactly
  node.each(function (d) {
    const nodeElement = d3.select(this);
    const inputLinks = linksByTarget.get(d.id) || [];

    const halfWidth = d.width / 2;

    // Create the complete border path that matches the rectangle exactly
    const borderPath = `M${-halfWidth + config.borderRadiusX},${
      -config.nodeHeight / 2
    }
                           L${halfWidth - config.borderRadiusX},${
      -config.nodeHeight / 2
    }
                           Q${halfWidth},${
      -config.nodeHeight / 2
    } ${halfWidth},${-config.nodeHeight / 2 + config.borderRadiusY}
                           L${halfWidth},${
      config.nodeHeight / 2 - config.borderRadiusY
    }
                           Q${halfWidth},${config.nodeHeight / 2} ${
      halfWidth - config.borderRadiusX
    },${config.nodeHeight / 2}
                           L${-halfWidth + config.borderRadiusX},${
      config.nodeHeight / 2
    }
                           Q${-halfWidth},${
      config.nodeHeight / 2
    } ${-halfWidth},${config.nodeHeight / 2 - config.borderRadiusY}
                           L${-halfWidth},${
      -config.nodeHeight / 2 + config.borderRadiusY
    }
                           Q${-halfWidth},${-config.nodeHeight / 2} ${
      -halfWidth + config.borderRadiusX
    },${-config.nodeHeight / 2} Z`;

    // Add the border path element
    const borderElement = nodeElement
      .append("path")
      .attr("d", borderPath)
      .attr("stroke-width", config.borderWidth)
      .attr("fill", "none")
      .attr("class", "node-border");

    // Set default border color - black for base bees, gray for others
    const isBaseBee = inputLinks.length === 0;
    borderElement.attr("stroke", isBaseBee ? "#000" : "#ddd");

    if (inputLinks.length > 0) {
      // Sort input links using the same logic as edge crossing minimization
      const sortedLinks = inputLinks
        .map((link) => {
          return {
            link,
            sourceY: nodeMap.get(link.source).y,
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

      if (inputLinks.length === 1) {
        // Single input - use that color for entire border
        const edgeColor =
          config.availableColors[nodeColors[sortedLinks[0].link.source] || 0];
        borderElement.attr("stroke", edgeColor);
      } else {
        // Multiple inputs - remove the main border and create separate colored segments
        borderElement.remove();

        // Find the colors based on actual spatial position (top/bottom)
        const topLinks = sortedLinks.filter((item) => item.offset < 0); // Negative offset = above center
        const bottomLinks = sortedLinks.filter((item) => item.offset >= 0); // Positive/zero offset = below center

        // Get colors for top and bottom edges based on spatial position
        const topColor =
          topLinks.length > 0
            ? config.availableColors[
                nodeColors[topLinks[topLinks.length - 1].link.source] || 0
              ]
            : config.availableColors[
                nodeColors[sortedLinks[0].link.source] || 0
              ];
        const bottomColor =
          bottomLinks.length > 0
            ? config.availableColors[
                nodeColors[bottomLinks[0].link.source] || 0
              ]
            : config.availableColors[
                nodeColors[sortedLinks[sortedLinks.length - 1].link.source] || 0
              ];

        // Top edge segment - complete top with both corners
        const topPath = `M${-halfWidth},${
          -config.nodeHeight / 2 + config.borderRadiusY
        } Q${-halfWidth},${-config.nodeHeight / 2} ${
          -halfWidth + config.borderRadiusX
        },${-config.nodeHeight / 2} L${halfWidth - config.borderRadiusX},${
          -config.nodeHeight / 2
        } Q${halfWidth},${-config.nodeHeight / 2} ${halfWidth},${
          -config.nodeHeight / 2 + config.borderRadiusY
        }`;
        nodeElement
          .append("path")
          .attr("d", topPath)
          .attr("stroke", topColor)
          .attr("stroke-width", config.borderWidth)
          .attr("fill", "none")
          .attr("class", "node-border-segment");

        // Bottom edge segment
        const bottomPath = `M${halfWidth},${
          config.nodeHeight / 2 - config.borderRadiusY
        } Q${halfWidth},${config.nodeHeight / 2} ${
          halfWidth - config.borderRadiusX
        },${config.nodeHeight / 2} L${-halfWidth + config.borderRadiusX},${
          config.nodeHeight / 2
        } Q${-halfWidth},${config.nodeHeight / 2} ${-halfWidth},${
          config.nodeHeight / 2 - config.borderRadiusY
        }`;
        nodeElement
          .append("path")
          .attr("d", bottomPath)
          .attr("stroke", bottomColor)
          .attr("stroke-width", config.borderWidth)
          .attr("fill", "none")
          .attr("class", "node-border-segment");

        // Left and right sides with default color
        const leftPath = `M${-halfWidth},${
          config.nodeHeight / 2 - config.borderRadiusY
        } L${-halfWidth},${-config.nodeHeight / 2 + config.borderRadiusY}`;
        nodeElement
          .append("path")
          .attr("d", leftPath)
          .attr("stroke", "#ddd")
          .attr("stroke-width", config.borderWidth)
          .attr("fill", "none")
          .attr("class", "node-border-segment");

        const rightPath = `M${halfWidth},${
          -config.nodeHeight / 2 + config.borderRadiusY
        } L${halfWidth},${config.nodeHeight / 2 - config.borderRadiusY}`;
        nodeElement
          .append("path")
          .attr("d", rightPath)
          .attr("stroke", "#ddd")
          .attr("stroke-width", config.borderWidth)
          .attr("fill", "none")
          .attr("class", "node-border-segment");
      }
    }
  });

  // Add text labels
  node
    .append("text")
    .attr("dy", "0.35em")
    .text((d) => d.name || d.id);

  return { nodeGroup, node };
}
