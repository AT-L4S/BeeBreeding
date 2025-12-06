# Intermediate JSON Format Specification

This document defines the intermediate format that all mod parsers output before conversion to final JSONC files.

## Format Structure

Each parser outputs an object with three main sections:

```javascript
{
  "bees": { ... },
  "mutations": [ ... ],
  "branches": { ... }
}
```

## Bees Object

Maps bee species UID to bee data:

```javascript
"bees": {
  "modid.speciesName": {
    "mod": "ModName",
    "name": "Species Display Name",
    "binomial": "scientific name",
    "branch": "branchid:branchname",
    "dominant": true/false,
    "colors": {
      "primary": "#RRGGBB",
      "secondary": "#RRGGBB"
    },
    "temperature": "HOT|WARM|NORMAL|COLD|ICY|HELLISH",
    "humidity": "ARID|NORMAL|DAMP",
    "hasEffect": true/false,
    "isSecret": false,
    "products": [
      {
        "item": "item_id or description",
        "chance": 0.15
      }
    ]
  }
}
```

## Mutations Array

List of mutation recipes:

```javascript
"mutations": [
  {
    "parent1": "modid.speciesName1",
    "parent2": "modid.speciesName2",
    "offspring": "modid.speciesOffspring",
    "chance": 10,
    "conditions": {
      "temperature": ["HOT", "HELLISH"],
      "humidity": ["ARID"],
      "biome": ["NETHER"],
      "block": ["minecraft:bookshelf"],
      "moonPhase": ["FULL"]
    }
  }
]
```

## Branches Object

Maps branch UID to branch data:

```javascript
"branches": {
  "modid:branchname": {
    "name": "Branch Display Name",
    "scientific": "Latin Name"
  }
}
```

## Notes

- All species UIDs should be lowercase and use format: `modid.species<Name>`
- Branch UIDs use format: `modid:branchname` or just `:branchname` for vanilla
- Colors are hex RGB strings with # prefix
- Mutation conditions are optional and only included when present
- Temperature/humidity values should match Forestry enum names
- Product items can be item IDs (minecraft:coal) or comb types (HONEY, OCCULT, etc.)
