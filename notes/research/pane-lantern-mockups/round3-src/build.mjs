// node build.mjs <out.html> [id ...]   — assembles base.html + variants/NN.css + variants/NN.json (all, or only the given NN ids)
import fs from 'node:fs'; import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const [out, ...only] = process.argv.slice(2);
const ids = fs.readdirSync(path.join(dir, 'variants')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(id => !only.length || only.includes(id)).sort();
let css = '', metas = [];
for (const id of ids) {
  const cssPath = path.join(dir, 'variants', id + '.css');
  if (fs.existsSync(cssPath)) css += `\n/* ===================================================== ${id} */\n` + fs.readFileSync(cssPath, 'utf8');
  metas.push(JSON.parse(fs.readFileSync(path.join(dir, 'variants', id + '.json'), 'utf8')));
}
const base = fs.readFileSync(path.join(dir, 'base.html'), 'utf8');
fs.writeFileSync(out, base.replace('/*VARIANT_CSS*/', () => css).replace('/*VARIANT_META*/[]', () => JSON.stringify(metas)));
console.log('built', out, ids.join(','));
