/**
 * Configuration and defaults for the Bee Breeding Tree Visualization
 */
export const config = {
  // Layout settings
  xSpacing: 180,
  ySpacing: 40,
  straightLength: 15,
  controlOffset: 20,
  spacing: 20,
  gap: 10, // Horizontal gap between edge straight segments

  // Node dimensions
  nodeHeight: 30,
  borderRadiusX: 20,
  borderRadiusY: 15,
  borderWidth: 5,

  // Visual settings
  availableColors: [
    "#e6194b",
    "#3cb44b",
    "#4363d8",
    "#f58231",
    "#911eb4",
    "#42d4f4",
    "#f032e6",
    "#bfef45",
    "#fabed4",
    "#469990",
    "#dcbeff",
    "#9a6324",
    "#800000",
    "#808000",
    "#a9a9a9",
  ],

  // Zoom settings
  zoomScaleExtent: [0.3, 2],
  zoomPadding: 150,

  // Layout modes
  layoutModes: {
    SPLIT: "split",
    COLUMN: "column",
  },
};
