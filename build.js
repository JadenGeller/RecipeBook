const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const yaml = require('js-yaml');

const recipesDir = path.join(__dirname, 'recipes');
const outputFile = path.join(__dirname, 'recipes.js');
const ingredientsFile = path.join(__dirname, 'ingredients.json');
const techniquesFile = path.join(__dirname, 'techniques.json');
const equipmentFile = path.join(__dirname, 'equipment.json');

// Load registries
const ingredientRegistry = JSON.parse(fs.readFileSync(ingredientsFile, 'utf-8'));
const techniquesRegistry = JSON.parse(fs.readFileSync(techniquesFile, 'utf-8'));
const equipmentRegistry = JSON.parse(fs.readFileSync(equipmentFile, 'utf-8'));

// Derive equipment from a list of techniques (walking up parent hierarchy)
function getEquipmentForTechniques(techniques) {
  const equipment = new Set();
  const prep = {};

  for (const techniqueName of techniques) {
    let current = techniqueName;
    const visited = new Set();

    // Walk up the parent chain
    while (current && !visited.has(current)) {
      visited.add(current);
      const technique = techniquesRegistry[current];
      if (!technique) break;

      // Add equipment from this technique
      for (const equip of technique.equipment || []) {
        equipment.add(equip);
      }

      // Track prep requirements
      if (technique.prep) {
        for (const [equip, prepAction] of Object.entries(technique.prep)) {
          prep[equip] = prepAction;
        }
      }

      current = technique.parent;
    }
  }

  return {
    list: Array.from(equipment).sort(),
    prep
  };
}

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
  const allEquipment = new Set();
  const allPrep = {};

  if (data.steps) {
    for (const [stepName, stepData] of Object.entries(data.steps)) {
      const inputs = (stepData.in || []).map(parseIngredient);
      const action = stepData.do || null;
      const techniques = stepData.techniques || [];

      // Derive equipment from techniques
      const equipmentResult = getEquipmentForTechniques(techniques);

      // Add to recipe-wide equipment
      for (const equip of equipmentResult.list) {
        allEquipment.add(equip);
      }
      for (const [equip, prepAction] of Object.entries(equipmentResult.prep)) {
        allPrep[equip] = prepAction;
      }

      steps[stepName] = {
        inputs,
        action,
        techniques,
        equipment: equipmentResult.list
      };
      stepOrder.push(stepName);
    }
  }

  // Extract all raw ingredients (for shopping list)
  const allIngredients = [];
  for (const step of Object.values(steps)) {
    for (const input of step.inputs) {
      if (input.type === 'raw') {
        allIngredients.push(input);
      }
    }
  }

  // Build equipment list with metadata
  const equipmentList = Array.from(allEquipment).sort().map(name => {
    const meta = equipmentRegistry[name] || {};
    return {
      name,
      kind: meta.kind || 'other',
      prep: allPrep[name] || null
    };
  });

  return {
    id,
    title: data.title,
    category: data.category,
    image: data.image,
    description: data.description || '',
    steps,
    stepOrder,
    ingredients: allIngredients, // flat list for backwards compat
    equipment: equipmentList,
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

const ingredients = ${JSON.stringify(ingredientRegistry, null, 2)};

const techniques = ${JSON.stringify(techniquesRegistry, null, 2)};

const equipment = ${JSON.stringify(equipmentRegistry, null, 2)};
`;

fs.writeFileSync(outputFile, output);
console.log(`Generated ${recipes.length} recipes → recipes.js`);
