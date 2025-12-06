# Migration to Mod-Specific Data Folders

## Current Status

The parser system is complete and functional with paths fixed to use `../whiteboard/`.

## Next Steps: Reorganizing Data by Mod

### Goal

Change from single merged files to mod-specific files:

**FROM:**

```
data/
  bees.jsonc
  breeding_pairs.jsonc
  combs.jsonc
```

**TO:**

```
data/
  forestry/
    bees.jsonc
    breeding_pairs.jsonc
    combs.jsonc
  extrabees/
    bees.jsonc
    breeding_pairs.jsonc
    combs.jsonc
  magicbees/
    bees.jsonc
    breeding_pairs.jsonc
    combs.jsonc
  careerbees/
    bees.jsonc
    breeding_pairs.jsonc
    combs.jsonc
  meatballcraft/
    bees.jsonc
    breeding_pairs.jsonc
    combs.jsonc
```

### Benefits of This Approach

1. **Modular Loading**: Can load only specific mods
2. **Easy Extension**: Adding custom GenDustry bees or new mod packs is simpler
3. **Smaller Files**: Each mod's data is separate
4. **Clear Dependencies**: Forestry is always required, other mods reference it

### Implementation Tasks

#### 1. Update [`output_builder.js`](scripts/output_builder.js)

Change `buildOutputFiles()` to:

- Create separate directories for each mod
- Generate mod-specific JSONC files
- Keep cross-mod references (e.g., ExtraBees mutations can reference Forestry bees)

#### 2. Update [`build.js`](scripts/build.js)

Change default output structure:

- Instead of `--output-dir ./data`, use `--output-dir ./data/<modname>`
- OR generate all mod folders automatically

#### 3. Update Data Loader ([`src/data/dataLoader.js`](../src/data/dataLoader.js))

Change from:

```javascript
// Load single merged files
const bees = await loadJSON("data/bees.jsonc");
const mutations = await loadJSON("data/breeding_pairs.jsonc");
```

To:

```javascript
// Load multiple mod files and merge in browser
const mods = [
  "forestry",
  "extrabees",
  "magicbees",
  "careerbees",
  "meatballcraft",
];
const allBees = {};
const allMutations = [];

for (const mod of mods) {
  const bees = await loadJSON(`data/${mod}/bees.jsonc`);
  const mutations = await loadJSON(`data/${mod}/breeding_pairs.jsonc`);
  Object.assign(allBees, bees);
  allMutations.push(...mutations);
}
```

#### 4. Optional: Add Mod Selection UI

Allow users to choose which mods to load:

- Forestry (always required)
- ExtraBees checkbox
- MagicBees checkbox
- CareerBees checkbox
- MeatballCraft checkbox

### Cross-Mod Reference Handling

Each mod's data will include UIDs that reference other mods:

**forestry/breeding_pairs.jsonc:**

```jsonc
[
  {
    "parent1": "forestry.speciesForest",
    "parent2": "forestry.speciesMeadows",
    "offspring": "forestry.speciesCommon",
    "chance": 15
  }
]
```

**extrabees/breeding_pairs.jsonc:**

```jsonc
[
  {
    // References Forestry bees
    "parent1": "forestry.speciesCommon",
    "parent2": "forestry.speciesCultivated",
    "offspring": "extrabees.species.rocky",
    "chance": 12
  }
]
```

**meatballcraft/breeding_pairs.jsonc:**

```jsonc
[
  {
    // Can reference ANY mod
    "parent1": "forestry.speciesImperial",
    "parent2": "magicbees.speciesArcane",
    "offspring": "meatballcraft.speciesCustom",
    "chance": 8
  }
]
```

### Migration Checklist

- [ ] Update [`output_builder.js`](scripts/output_builder.js) to generate mod-specific folders
- [ ] Update [`build.js`](scripts/build.js) CLI options for new structure
- [ ] Test parser output with new folder structure
- [ ] Update [`src/data/dataLoader.js`](../src/data/dataLoader.js) to load multiple mod files
- [ ] Update visualization to handle merged data from multiple sources
- [ ] Test that cross-mod references resolve correctly
- [ ] Update documentation in [`README.md`](scripts/README.md)
- [ ] Consider adding mod selection UI

### Backward Compatibility

Option: Keep both output formats during transition:

- `data/merged/` - Single files (current format)
- `data/forestry/`, `data/extrabees/`, etc. - Mod-specific files (new format)

This allows testing the new format while keeping the old format working.
