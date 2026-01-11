const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const yaml = require('js-yaml');

const recipesDir = path.join(__dirname, 'recipes');
const outputFile = path.join(__dirname, 'recipes.js');

// Known units for parsing
const UNITS = new Set([
  'tbsp', 'tsp', 'cup', 'cups', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l',
  'clove', 'cloves', 'can', 'cans', 'bunch', 'bunches', 'head', 'heads',
  'piece', 'pieces', 'slice', 'slices', 'pinch', 'handful', 'handfuls',
  'sprig', 'sprigs', 'stalk', 'stalks', 'rib', 'ribs', 'block', 'medium', 'small', 'large'
]);

// Parse an ingredient string like "4 Tbsp peanut butter" or "8 oz tempeh, cubed"
function parseIngredient(line) {
  const raw = line;

  // Extract prep after comma
  let prep = null;
  const commaIdx = line.lastIndexOf(',');
  if (commaIdx > 0) {
    prep = line.slice(commaIdx + 1).trim();
    line = line.slice(0, commaIdx).trim();
  }

  // Parse amount, unit, and ingredient name
  const match = line.match(/^([\d./\s]+)\s+(\S+)\s+(.+)$/);
  if (match) {
    const [, amount, unit, name] = match;
    return {
      type: 'raw',
      name: name.toLowerCase(),
      amount: amount.trim(),
      unit,
      prep,
      raw
    };
  }

  // No amount/unit - might be a reference to another step
  return { type: 'ref', name: line.toLowerCase(), raw };
}

// Get all recipe files (both .md and .yaml)
function getRecipeFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getRecipeFiles(fullPath));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.yaml')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Parse a YAML recipe with steps
function parseYamlRecipe(filePath, id) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = yaml.load(content);

  // Parse steps
  const steps = {};
  const stepOrder = [];

  if (data.steps) {
    for (const [stepName, stepData] of Object.entries(data.steps)) {
      // Handle sequence-based steps (e.g., sauté with multiple additions)
      if (stepData.sequence) {
        const sequence = stepData.sequence.map(phase => ({
          inputs: (phase.with || phase.add || []).map(parseIngredient),
          isAddition: !!phase.add,
          for: phase.for || null,
          until: phase.until || null
        }));

        steps[stepName] = {
          technique: { name: stepData.do },
          sequence,
          duration: stepData.duration || null
        };
      } else {
        // Simple step with inputs and technique
        const inputs = (stepData.with || []).map(parseIngredient);
        const technique = stepData.do ? {
          name: stepData.do,
          for: stepData.for || null,
          until: stepData.until || null
        } : null;

        steps[stepName] = { inputs, technique, duration: stepData.duration || null };
      }
      stepOrder.push(stepName);
    }
  }

  // Extract all raw ingredients (for shopping list)
  const allIngredients = [];
  for (const step of Object.values(steps)) {
    if (step.sequence) {
      for (const phase of step.sequence) {
        for (const input of phase.inputs) {
          if (input.type === 'raw') {
            allIngredients.push(input);
          }
        }
      }
    } else if (step.inputs) {
      for (const input of step.inputs) {
        if (input.type === 'raw') {
          allIngredients.push(input);
        }
      }
    }
  }

  return {
    id,
    title: data.title,
    category: data.category,
    image: data.image,
    description: data.description || '',
    steps,
    stepOrder,
    ingredients: allIngredients,
    meta: data.meta || '',
    source: data.source || '',
    format: 'yaml'
  };
}

// Parse a markdown recipe (legacy format)
function parseMarkdownRecipe(filePath, id) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data, content: body } = matter(content);

  const sections = body.split(/^## /m).filter(Boolean);

  let ingredients = [];
  let instructions = [];

  for (const section of sections) {
    const [title, ...rest] = section.split('\n');
    const text = rest.join('\n').trim();

    if (title.toLowerCase().includes('ingredient')) {
      ingredients = text.split('\n')
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
        .map(line => {
          const parsed = parseIngredient(line);
          return { ...parsed, raw: line };
        });
    } else if (title.toLowerCase().includes('instruction')) {
      instructions = text.split('\n')
        .map(line => line.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim())
        .filter(line => line && !line.startsWith('#'));
    }
  }

  return {
    id,
    title: data.title,
    category: data.category,
    image: data.image,
    description: data.description || '',
    ingredients,
    instructions,
    meta: data.meta || '',
    source: data.source || '',
    format: 'markdown'
  };
}

// Parse recipe based on file type
function parseRecipe(filePath, id) {
  if (filePath.endsWith('.yaml')) {
    return parseYamlRecipe(filePath, id);
  } else {
    return parseMarkdownRecipe(filePath, id);
  }
}

// Main build
const files = getRecipeFiles(recipesDir);

// Prefer YAML over MD if both exist
const filesByName = {};
for (const file of files) {
  const name = path.basename(file).replace(/\.(md|yaml)$/, '');
  if (!filesByName[name] || file.endsWith('.yaml')) {
    filesByName[name] = file;
  }
}

const uniqueFiles = Object.values(filesByName);
const recipes = uniqueFiles.map((file, i) => parseRecipe(file, i + 1));

const output = `// Auto-generated by build.js - do not edit directly
const recipes = ${JSON.stringify(recipes, null, 2)};
`;

fs.writeFileSync(outputFile, output);
console.log(`Generated ${recipes.length} recipes → recipes.js`);
