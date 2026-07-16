const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../out');

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Calculate depth relative to outDir
      const relativePath = path.relative(outDir, fullPath);
      const depth = relativePath.split(path.sep).length - 1;
      const prefix = depth > 0 ? '../'.repeat(depth) : './';

      // Replace absolute "/_next" and "/favicon.ico" with relative prefix
      content = content.replace(/(href|src|from)="\/_next/g, `$1="${prefix}_next`);
      content = content.replace(/(href|src)="\/favicon\.ico/g, `$1="${prefix}favicon.ico`);
      content = content.replace(/"\/_next/g, `"${prefix}_next`);
      content = content.replace(/'\/_next/g, `'${prefix}_next`);
      
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

if (fs.existsSync(outDir)) {
  walk(outDir);
  console.log("Successfully converted Next.js absolute asset paths to relative paths for zero-config GitHub Pages!");
} else {
  console.log("out/ directory not found.");
}
