# Bee Breeding Tree Visualization - Complete Project Architecture

## Overview

This final architecture design incorporates all your requirements including comb processing, breeding pairs with probabilities, and updated data structures.

## Core Principles

1. **Comprehensive Data Model**: Supports bees, species, combs, and breeding pairs
2. **Probability-Based Systems**: Percentage-based breeding and processing
3. **Dynamic Data Loading**: All data files can be updated independently
4. **Performance Optimized**: Efficient data structures and processing

## Complete File Structure

```
beebreeding/
├── src/
│   ├── core/                  # Core application logic
│   │   ├── app.js              # Main application entry point
│   │   ├── config.js           # Configuration and defaults
│   │   └── main.js             # Main visualization controller
│   │
│   ├── data/                  # Data management
│   │   ├── dataLoader.js       # Loads and processes all data files
│   │   ├── beeProcessor.js     # Processes bee data and relationships
│   │   ├── breedingProcessor.js # Handles breeding pair probabilities
│   │   └── combProcessor.js    # Processes comb data and conversions
│   │
│   ├── visualization/          # Visualization components
│   │   ├── treeRenderer.js     # Main tree rendering
│   │   ├── nodeRenderer.js     # Node rendering and styling
│   │   ├── edgeRenderer.js     # Edge rendering with probability display
│   │   └── layout.js           # Layout algorithms
│   │
│   ├── ui/                    # User interface
│   │   ├── controls.js         # UI controls and interactions
│   │   ├── search.js           # Search functionality
│   │   ├── filters.js          # Filtering controls
│   │   └── infoPanel.js        # Information display with probabilities
│   │
│   └── utils/                 # Utilities
│       ├── helpers.js          # General helpers
│       └── math.js             # Math utilities
│
├── data/                      # Data files (can be updated independently)
│   ├── bees.json              # Main bee data with product info
│   │   # {
│   │   #   "Special": {
│   │   #     "mod": "Forestry",
│   │   #     "idealTemperature": "cold",
│   │   #     "idealHumidity": "dry"
│   │   #     "temperatureTolerance": "none",
│   │   #     "humidityTolerance": "none",
│   │   #     "speed": "normal",
│   │   #     "lifespan": "normal",
│   │   #     "fertility": "normal",
│   │   #     "neverSleeps": true,
│   │   #     "caveDwelling": true,
│   │   #     "tolerantFlyer": true,
│   │   #     "products": [
│   │   #       {"name": "forestry:honeyDrop", "percentage": 0.15},
│   │   #       {"name": "forestry:honeyDrop", "percentage": 0.15},
│   │   #       {"name": "forestry:honeyDrop", "percentage": 0.30, "specialty": true},
│   │   #       {"name": "forestry:honeyComb", "percentage": 0.20}
│   │   #     ]
│   │   #   }
│   │   # }
│   │
│   ├── breeding_pairs.json    # Breeding combinations with probabilities
│   │   # {
│   │   #   "pairs": [
│   │   #     {
│   │   #       "parents": ["Common", "Forest"],
│   │   #       "children": [
│   │   #         {"species": "Meadows", "probability": 0.15},
│   │   #         {"species": "Tropical", "probability": 0.20}
│   │   #       ],
│   │   #     }
│   │   #   ]
│   │   # }
│   │
│   └── combs.json             # Comb processing information
│       # {
│       #   "combs": [
│       #     {
│       #       "name": "forestry:honeyComb",
│       #       "processing": [
│       #         {"product": "forestry:honeyDrop", "percentage": 0.8},
│       #         {"product": "forestry:beeswax", "percentage": 0.2}
│       #       ]
│       #     }
│       #   ]
│       # }
│
├── assets/
│   ├── css/
│   │   └── style.css          # Main stylesheet
│   │
│   └── icons/                 # UI icons
│
├── lib/
│   └── d3.js                  # D3.js library
│
├── index.html                 # Main HTML entry point
└── README.md                  # Project documentation
```

---

## Icon Organization

Bee and item images are organized using a convention-based system with mod-specific folders:

- **Bee Images**: Located in `assets/bees/{mod_name}/{bee_name}.png`

  - Example: `assets/bees/forestry/common.png`
  - Example: `assets/bees/extrabees/industrious.png`

- **Item Images**: Located in `assets/items/{mod_name}/{item_name}.png`

  - Example: `assets/items/forestry/honey_comb.png`
  - Example: `assets/items/extrabees/royal_jelly.png`
