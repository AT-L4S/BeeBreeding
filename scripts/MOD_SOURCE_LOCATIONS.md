# Mod Source Code Locations

This file documents where the source code for each mod is located for parsing bee data.

## Mod Directories

### Forestry

- **Path**: `whiteboard/ForestryMC-mc-1.12/src/main/java/forestry/apiculture/genetics/`
- **Format**: Java source files
- **Key Files**: Look for bee species definitions and mutations

### ExtraBees (Binnie)

- **Path**: `whiteboard/Binnie-master-MC1.12/extrabees/src/main/java/binnie/extrabees/genetics/`
- **Format**: Java source files
- **Key Files**: Bee species and breeding definitions

### CareerBees

- **Path**: `whiteboard/Careerbees-master/src/main/java/com/rwtema/careerbees/bees/`
- **Format**: Java source files
- **Key Files**: CareerBeeSpecies.java and related files

### MagicBees

- **Path**: `whiteboard/MagicBees-1.12/src/main/java/magicbees/bees/`
- **Format**: Java source files
- **Key Files**: Bee species and mutation definitions

### MeatballCraft

- **Path**: `whiteboard/meatball_bees.cfg`
- **Format**: Gendustry .cfg file
- **Parser**: Uses Gendustry config format parser

## Notes

- All Java-based mods use similar structures but may have different class hierarchies
- Gendustry .cfg format is text-based and easier to parse
- Each mod defines bees and mutations, but the exact structure varies
