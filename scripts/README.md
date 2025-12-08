# Bee Breeding Data Parser System

This directory contains scripts to convert mod source files into the JSONC data files used by the bee breeding visualization.

## Overview

The parser system converts source code from various Minecraft bee mods into standardized JSONC files:

- [`bees.jsonc`](../data/bees.jsonc): All bee species data
- [`mutations.jsonc`](../data/mutations.jsonc): All mutation/breeding relationships
- [`combs.jsonc`](../data/combs.jsonc): All honeycomb products

## Architecture

The system uses a modular architecture with three layers:

1. **Mod-Specific Parsers** (`parsers/` directory)

   - Each parser handles one mod's specific file format
   - All parsers output a consistent intermediate JSON format

2. **Output Builder** ([`output_builder.js`](output_builder.js))

   - Merges intermediate data from all parsers
   - Converts to final JSONC format with proper sorting

3. **Build Script** ([`build.js`](build.js))
   - Orchestrates all parsers
   - Main entry point for rebuilding data files

## Supported Mods

| Mod           | Parser                                                 | Source File Format                         |
| ------------- | ------------------------------------------------------ | ------------------------------------------ |
| Forestry      | [`forestry_parser.js`](parsers/forestry_parser.js)     | Java enum (BeeDefinition.java)             |
| ExtraBees     | [`extrabees_parser.js`](parsers/extrabees_parser.js)   | Java enum (ExtraBeeDefinition.java)        |
| CareerBees    | [`careerbees_parser.js`](parsers/careerbees_parser.js) | Java static fields (CareerBeeSpecies.java) |
| MagicBees     | [`magicbees_parser.js`](parsers/magicbees_parser.js)   | Java enum (EnumBeeSpecies.java)            |
| MeatballCraft | [`gendustry_parser.js`](parsers/gendustry_parser.js)   | GenDustry .cfg file                        |

## Usage

### Quick Start

Rebuild all data files from mod sources:

```bash
cd scripts
node build.js
```

This will:

1. Parse all mod source files
2. Merge the data
3. Generate updated JSONC files in [`../data/`](../data/)

### Advanced Options

```bash
# Build only specific mods
node build.js --mods forestry,extrabees

# Save intermediate JSON files for debugging
node build.js --save-intermediate

# Specify custom output directory
node build.js --output-dir ./custom-output

# Combine options
node build.js --mods magicbees --save-intermediate --intermediate-dir ./debug
```

### Testing Individual Parsers

Each parser can be run standalone for testing:

```bash
# Forestry
node parsers/forestry_parser.js whiteboard/ForestryMC-mc-1.12/src/main/java/forestry/apiculture/genetics/BeeDefinition.java output.json

# ExtraBees
node parsers/extrabees_parser.js whiteboard/Binnie-Mods-mc-1.12/extrabees/src/main/java/binnie/extrabees/genetics/ExtraBeeDefinition.java output.json

# CareerBees
node parsers/careerbees_parser.js whiteboard/CareerBees-mc-1.12/src/main/java/com/rwtema/careerbees/bees/CareerBeeSpecies.java output.json

# MagicBees
node parsers/magicbees_parser.js whiteboard/MagicBees-1.12/src/main/java/magicbees/bees/EnumBeeSpecies.java output.json

# MeatballCraft (GenDustry config)
node parsers/gendustry_parser.js whiteboard/meatball_bees.cfg output.json
```

## Intermediate Format

All parsers output a consistent intermediate JSON format (see [`INTERMEDIATE_FORMAT.md`](INTERMEDIATE_FORMAT.md)):

```javascript
{
  "bees": {
    "modid.speciesName": {
      "mod": "ModName",
      "name": "Display Name",
      "binomial": "scientific name",
      "branch": "branchid:branchname",
      "dominant": true/false,
      "colors": {
        "primary": "#RRGGBB",
        "secondary": "#RRGGBB"
      },
      "temperature": "NORMAL|HOT|COLD|etc",
      "humidity": "NORMAL|ARID|DAMP",
      "hasEffect": true/false,
      "isSecret": false,
      "products": [
        { "item": "item_id", "chance": 0.15 }
      ]
    }
  },
  "mutations": [
    {
      "parent1": "modid.species1",
      "parent2": "modid.species2",
      "offspring": "modid.species3",
      "chance": 10,
      "conditions": {
        "temperature": ["HOT"],
        "biome": ["NETHER"],
        "block": ["minecraft:bookshelf"],
        "moonPhase": ["FULL"]
      }
    }
  ],
  "branches": {
    "modid:branchname": {
      "name": "Display Name",
      "scientific": "Latin Name"
    }
  }
}
```

## Mutation Conditions

The following mutation conditions are parsed from source files:

| Condition     | Description                  | Example                                        |
| ------------- | ---------------------------- | ---------------------------------------------- |
| `temperature` | Required climate temperature | `["HOT", "HELLISH"]`                           |
| `humidity`    | Required climate humidity    | `["ARID"]`                                     |
| `biome`       | Required biome type          | `["NETHER"]`                                   |
| `block`       | Required nearby block        | `["minecraft:bookshelf"]`                      |
| `moonPhase`   | Required moon phase(s)       | `["FULL"]` or `["WAXING_HALF", "WANING_HALF"]` |
| `dimension`   | Required dimension ID        | `-1` (Nether), `0` (Overworld), `1` (End)      |

### Moon Phase Values

(MagicBees only)

- `NEW`
- `WAXING_CRESCENT`
- `WAXING_HALF`
- `WAXING_GIBBOUS`
- `FULL`
- `WANING_GIBBOUS`
- `WANING_HALF`
- `WANING_CRESCENT`

## File Structure

```
scripts/
├── README.md                    # This file
├── INTERMEDIATE_FORMAT.md       # Intermediate format specification
├── MOD_SOURCE_LOCATIONS.md      # Mod source file locations
├── build.js                     # Main build orchestrator
├── output_builder.js            # JSONC output generator
└── parsers/                     # Mod-specific parsers
    ├── forestry_parser.js
    ├── extrabees_parser.js
    ├── careerbees_parser.js
    ├── magicbees_parser.js
    └── gendustry_parser.js
```

## Updating Mod Sources

1. Update mod source file paths in [`build.js`](build.js) if needed
2. See [`MOD_SOURCE_LOCATIONS.md`](MOD_SOURCE_LOCATIONS.md) for current locations
3. Run `node build.js` to regenerate data files

## Troubleshooting

### Parser fails to find mutations

- Check that the Java file contains a `registerMutations()` method
- Verify the mutation pattern matches the parser's regex
- Use `--save-intermediate` to inspect parsed data

### Missing bees in output

- Check enum pattern in source file matches parser expectations
- Verify bee definitions include required fields (branch, colors, etc.)
- Run parser individually to see parsing errors

### Incorrect species references

- Check that species name resolution handles all mod prefixes
- Verify UID format matches: `modid.speciesName` or `modid.species.Name`

## Development

### Adding a New Mod Parser

1. Create new parser in `parsers/` directory
2. Follow existing parser structure
3. Output intermediate format (see [`INTERMEDIATE_FORMAT.md`](INTERMEDIATE_FORMAT.md))
4. Add mod configuration to [`build.js`](build.js):

```javascript
const MOD_CONFIGS = {
  // ... existing configs
  newmod: {
    name: "NewMod",
    parser: parseNewMod,
    sourceFile: "path/to/source.java",
  },
};
```

5. Export parse function: `module.exports = { parseNewMod };`
6. Test standalone: `node parsers/newmod_parser.js <source-file> output.json`
7. Test in build: `node build.js --mods newmod --save-intermediate`

### Parser Implementation Guidelines

- Use regex for pattern matching (Java/cfg syntax)
- Handle species reference resolution (cross-mod references)
- Parse all mutation conditions
- Extract bee products/specialties
- Clean up temporary fields before returning
- Add CLI usage for standalone testing

## License

This parser system is part of the Bee Breeding Visualization project.
