/**
 * Edge rendering for bee breeding tree visualization
 */
import { config } from "/src/core/config.js";

export function renderEdges(svg, links, nodes, nodeMap, nodeColors) {
  // Group links by target to calculate input connection offsets
  const linksByTarget = d3.group(links, (d) => d.target);

  // Calculate enhanced data for links including intersection priorities
  const linksWithData = links.map((d) => {
    const source = nodeMap.get(d.source);
    const target = nodeMap.get(d.target);
    const sourceWidth = source.width || 120;
    const targetWidth = target.width || 120;

    return {
      ...d,
      sourceX: source.x + sourceWidth / 2,
      sourceY: source.y,
      targetX: target.x - targetWidth / 2 + 3,
      targetY: target.y, // Will be updated below with offset
      targetYOffset: 0, // Will be calculated below
      distanceFromSource:
        Math.abs(source.x + sourceWidth / 2 - target.x) +
        Math.abs(source.y - target.y),
    };
  });

  // Calculate vertical offsets to minimize crossings
  linksByTarget.forEach((targetLinks, targetId) => {
    if (targetLinks.length > 1) {
      // Sort parent links by their source Y position to minimize crossings
      const sortedLinks = targetLinks
        .map((link) => {
          const linkData = linksWithData.find(
            (ld) => ld.source === link.source && ld.target === link.target
          );
          return {
            link,
            linkData,
            sourceY: linkData.sourceY,
          };
        })
        .sort((a, b) => a.sourceY - b.sourceY);

      // Assign vertical offsets based on sorted order
      const spacing = config.spacing;
      const totalHeight = (sortedLinks.length - 1) * spacing;

      sortedLinks.forEach((item, index) => {
        const targetYOffset = index * spacing - totalHeight / 2;
        item.linkData.targetYOffset = targetYOffset;
        item.linkData.targetY = nodeMap.get(targetId).y + targetYOffset;
      });
    }
  });

  // Function to find intersection point between two lines
  function findIntersection(line1, line2) {
    const { sourceX: x1, sourceY: y1, targetX: x2, targetY: y2 } = line1;
    const { sourceX: x3, sourceY: y3, targetX: x4, targetY: y4 } = line2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
      };
    }
    return null;
  }

  // Sort links with collision-aware priority
  linksWithData.sort((a, b) => {
    const intersection = findIntersection(a, b);

    if (intersection) {
      // For each edge, calculate distance from intersection to both input and output connections
      const aDistToInput = Math.sqrt(
        Math.pow(intersection.x - a.targetX, 2) +
          Math.pow(intersection.y - a.targetY, 2)
      );
      const aDistToOutput = Math.sqrt(
        Math.pow(intersection.x - a.sourceX, 2) +
          Math.pow(intersection.y - a.sourceY, 2)
      );
      const aMinDist = Math.min(aDistToInput, aDistToOutput);

      const bDistToInput = Math.sqrt(
        Math.pow(intersection.x - b.targetX, 2) +
          Math.pow(intersection.y - b.targetY, 2)
      );
      const bDistToOutput = Math.sqrt(
        Math.pow(intersection.x - b.sourceX, 2) +
          Math.pow(intersection.y - b.sourceY, 2)
      );
      const bMinDist = Math.min(bDistToInput, bDistToOutput);

      // Edge with smaller minimum distance should be on top
      return aMinDist - bMinDist;
    }

    // No intersection - use generation distance as fallback
    const aGenDist = Math.abs(
      nodeMap.get(a.target).generation - nodeMap.get(a.source).generation
    );
    const bGenDist = Math.abs(
      nodeMap.get(b.target).generation - nodeMap.get(b.source).generation
    );
    return aGenDist - bGenDist;
  });

  // Create links in the link group
  const linkGroup = svg.append("g").attr("class", "links");

  const link = linkGroup
    .selectAll(".link")
    .data(linksWithData)
    .join("path")
    .attr("class", "link")
    .attr("d", (d) => {
      const source = nodeMap.get(d.source);
      const target = nodeMap.get(d.target);
      const sourceWidth = source.width || 120;
      const targetWidth = target.width || 120;

      const targetY = target.y + d.targetYOffset;

      // Connect to the straight sides of rounded rectangles, extending well into the node
      const sourceX = source.x + sourceWidth / 2; // Right edge of source
      const targetX = target.x - targetWidth / 2 + 3; // Left edge of target

      // Add straight segments that extend well into the node edges to eliminate gaps
      const sourceXStraight = sourceX + config.straightLength;
      const targetXStraight = targetX - config.straightLength;

      // Create smoother control points for gradual transition
      const controlX1 = sourceX + config.controlOffset;
      const controlX2 = targetX - config.controlOffset;

      // Create path: straight into node -> smooth curve -> straight into node
      return `M${sourceX},${source.y} L${sourceXStraight},${source.y} C${controlX1},${source.y} ${controlX2},${targetY} ${targetXStraight},${targetY} L${targetX},${targetY}`;
    })
    .style("stroke", (d) => {
      return config.availableColors[nodeColors[d.source] || 0];
    });

  return { linkGroup, link };
}
