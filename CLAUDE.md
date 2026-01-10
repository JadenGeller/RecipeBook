# RecipeBook

Vegan recipe collection with cook mode (voice control).

## Stack

- Plain HTML/CSS/JS (no framework)
- Bun for build tooling
- Markdown files with frontmatter for recipe content

## Commands

```bash
bun run build    # Generate recipes.js from markdown files
```

## Adding/Editing Recipes

1. Create/edit markdown files in `recipes/`
2. Run `bun run build`
3. Commit both the `.md` file and updated `recipes.js`

## Recipe Format

```markdown
---
title: Recipe Name
category: dinner|breakfast|salads
image: images/filename.jpg
description: One-line description
meta: "Yield: 4 servings | Prep: 10 min | Cook: 20 min"
source: https://original-recipe-url.com
---

## Ingredients

- 1 cup item
- 2 Tbsp another item

## Instructions

1. First step
2. Second step
```

## File Structure

```
recipes/           # Source markdown files (edit these)
recipes.js         # Generated - do not edit directly
build.js           # Markdown → JS build script
index.html         # Single-page app with cook mode
images/            # Recipe photos
```

## Images

When adding a recipe, download the hero image and save to `images/` with a kebab-case filename matching the recipe.
