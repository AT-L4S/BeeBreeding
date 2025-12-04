/**
 * UI controls for bee breeding tree visualization
 */
export function setupControls(zoom, svg, fitView, toggleLeafLayout) {
  // Set up event listeners for controls
  document
    .getElementById("layoutToggle")
    .addEventListener("click", toggleLeafLayout);

  // Add zoom behavior with proper mouse-relative zooming and symmetric pan constraints
  const zoomBehavior = d3
    .zoom()
    .scaleExtent(zoom.scaleExtent)
    .on("zoom", (event) => {
      const transform = event.transform;
      const svgWidth = svg.node().clientWidth || 1200;
      const svgHeight = svg.node().clientHeight || 800;

      // Calculate tree bounds
      const treeMinX = Math.min(
        ...nodes.map((n) => n.x - (n.width || 100) / 2)
      );
      const treeMaxX = Math.max(
        ...nodes.map((n) => n.x + (n.width || 100) / 2)
      );
      const treeMinY = Math.min(...nodes.map((n) => n.y));
      const treeMaxY = Math.max(...nodes.map((n) => n.y));

      const treeWidth = (treeMaxX - treeMinX) * transform.k;
      const treeHeight = (treeMaxY - treeMinY) * transform.k;

      // Symmetric padding - equal distance from edges
      const padding = 150;

      // Calculate symmetric bounds - only constrain if necessary
      const maxTranslateX = padding;
      const minTranslateX = svgWidth - treeWidth - padding;
      const maxTranslateY = padding;
      const minTranslateY = svgHeight - treeHeight - padding;

      // Only constrain if the tree would go outside bounds
      let constrainedX = transform.x;
      let constrainedY = transform.y;

      if (minTranslateX < maxTranslateX) {
        constrainedX = Math.max(
          minTranslateX,
          Math.min(maxTranslateX, transform.x)
        );
      }
      if (minTranslateY < maxTranslateY) {
        constrainedY = Math.max(
          minTranslateY,
          Math.min(maxTranslateY, transform.y)
        );
      }

      // Apply the transform
      g.attr(
        "transform",
        `translate(${constrainedX + margin.left}, ${
          constrainedY + margin.top
        }) scale(${transform.k})`
      );
    });

  svg.call(zoomBehavior);

  return {
    resetHighlight,
    fitView,
    toggleLeafLayout,
  };
}

export function resetHighlight() {
  node.classed("highlighted connected faded", false);
  link.classed("highlighted faded", false);

  // Remove outer selection borders
  node.selectAll(".outer-selection-border").remove();

  // Reset all node borders to their default colors
  node.each(function (d) {
    const nodeElement = d3.select(this);
    const inputLinks = linksByTarget.get(d.id) || [];

    if (inputLinks.length === 0) {
      nodeElement.selectAll(".node-border").attr("stroke", "#000");
    } else if (inputLinks.length === 1) {
      const edgeColor =
        config.availableColors[nodeColors[inputLinks[0].source] || 0];
      nodeElement
        .selectAll(".node-border, .node-border-segment")
        .attr("stroke", edgeColor);
    } else {
      // Multiple inputs - restore segment colors using same logic as edge crossing minimization
      const sortedLinks = inputLinks
        .map((link) => {
          const linkData = linksWithData.find(
            (ld) => ld.source === link.source && ld.target === link.target
          );
          return {
            link,
            linkData,
            sourceY: linkData ? linkData.sourceY : 0,
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

      // Find the colors based on actual spatial position (top/bottom)
      const topLinks = sortedLinks.filter((item) => item.offset < 0); // Negative offset = above center
      const bottomLinks = sortedLinks.filter((item) => item.offset >= 0); // Positive/zero offset = below center

      // Get colors for top and bottom edges based on spatial position
      const topColor =
        topLinks.length > 0
          ? config.availableColors[
              nodeColors[topLinks[topLinks.length - 1].link.source] || 0
            ]
          : config.availableColors[nodeColors[sortedLinks[0].link.source] || 0];
      const bottomColor =
        bottomLinks.length > 0
          ? config.availableColors[nodeColors[bottomLinks[0].link.source] || 0]
          : config.availableColors[
              nodeColors[sortedLinks[sortedLinks.length - 1].link.source] || 0
            ];

      const segments = nodeElement.selectAll(".node-border-segment").nodes();
      if (segments.length >= 4) {
        d3.select(segments[0]).attr("stroke", topColor); // top
        d3.select(segments[1]).attr("stroke", bottomColor); // bottom
        d3.select(segments[2]).attr("stroke", "#ddd"); // left
        d3.select(segments[3]).attr("stroke", "#ddd"); // right
      }

      nodeElement.selectAll(".node-border").attr("stroke", "#ddd");
    }
  });

  document.getElementById("infoPanel").style.display = "none";
}
