# RecipeBook

Vegan recipe collection with cook mode (voice control).

## Stack

- Plain HTML/CSS/JS (no framework)
- Bun for build tooling
- YAML files for structured recipe content

## Commands

```bash
bun run build    # Generate recipes.js from YAML files
```

## Adding/Editing Recipes

1. Create/edit YAML files in `recipes/`
2. Run `bun run build`
3. Commit both the `.yaml` file and updated `recipes.js`

## Recipe Format

```yaml
title: Recipe Name
category: hot meals|cold meals|desserts
image: images/filename.jpg
description: One-line description
meta: "Yield: 4 servings | Prep: 10 min | Cook: 20 min"
source: https://original-recipe-url.com

steps:
  step name:
    with:
      - 1 cup ingredient
      - "@previous step"        # Reference other steps with @
    do: action (e.g., mix, sauté, bake)
    for: 10 min                 # Optional duration phrase
    until: description          # Optional completion state
    duration: 10 min            # Time for cook mode timer

  multi-part step:
    do: sauté
    duration: 15 min
    sequence:                   # For steps with multiple stages
      - with:
          - "@some step"
        for: 5 min
        until: golden
      - add:
          - new ingredient
        for: 5 min
        until: done
```

## File Structure

```
recipes/           # Source YAML files (edit these)
recipes.js         # Generated - do not edit directly
build.js           # YAML → JS build script
index.html         # Single-page app with cook mode
images/            # Recipe photos
```

## Images

When adding a recipe, download the hero image and save to `images/` with a kebab-case filename matching the recipe.
