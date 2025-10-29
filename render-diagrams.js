#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read the markdown file
const markdownPath = path.join(__dirname, 'COMMUNICATION_PROTOCOL.md');
const markdownContent = fs.readFileSync(markdownPath, 'utf8');

// Extract all mermaid diagrams
const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
const diagrams = [];
let match;

while ((match = mermaidRegex.exec(markdownContent)) !== null) {
  diagrams.push(match[1].trim());
}

console.log(`Found ${diagrams.length} Mermaid diagrams`);

// Create diagrams directory if it doesn't exist
const diagramsDir = path.join(__dirname, 'diagrams');
if (!fs.existsSync(diagramsDir)) {
  fs.mkdirSync(diagramsDir, { recursive: true });
}

// Define diagram names based on their position and content
const diagramNames = [
  '01-card-hierarchy',
  '02-communication-flow',
  '03-additional-frame',
  '04-des-authentication',
  '05-aes-authentication',
  '06-ev2-authentication',
  '07-card-initialization',
  '08-application-creation',
  '09-payment-transaction',
  '10-key-change-flow',
  '11-key-rollover'
];

// Save each diagram to a .mmd file
diagrams.forEach((diagram, index) => {
  const name = diagramNames[index] || `diagram-${index + 1}`;
  const mmdPath = path.join(diagramsDir, `${name}.mmd`);

  fs.writeFileSync(mmdPath, diagram, 'utf8');
  console.log(`Saved: ${name}.mmd`);
});

console.log('\nRendering diagrams to PNG...');

// Render each diagram using mermaid-cli
diagrams.forEach((diagram, index) => {
  const name = diagramNames[index] || `diagram-${index + 1}`;
  const mmdPath = path.join(diagramsDir, `${name}.mmd`);
  const pngPath = path.join(diagramsDir, `${name}.png`);
  const svgPath = path.join(diagramsDir, `${name}.svg`);

  try {
    console.log(`Rendering ${name}...`);

    // Render to PNG with high quality
    execSync(`npx -p @mermaid-js/mermaid-cli mmdc -i "${mmdPath}" -o "${pngPath}" -b transparent -s 2`, {
      stdio: 'inherit'
    });

    // Render to SVG for scalability
    execSync(`npx -p @mermaid-js/mermaid-cli mmdc -i "${mmdPath}" -o "${svgPath}" -b transparent`, {
      stdio: 'inherit'
    });

    console.log(`✓ Rendered: ${name}.png and ${name}.svg`);
  } catch (error) {
    console.error(`✗ Failed to render ${name}:`, error.message);
  }
});

console.log('\n✓ All diagrams rendered successfully!');
console.log(`\nDiagrams saved to: ${diagramsDir}`);
