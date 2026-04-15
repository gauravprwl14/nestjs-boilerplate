# Generate Swagger

Export the Swagger/OpenAPI specification to `docs/api/swagger.json`.

## Steps

1. Ensure the app builds: `npm run build`
2. Start the app temporarily (or use the running dev server)
3. Fetch the spec: `curl -s http://localhost:3000/docs-json > docs/api/swagger.json`
4. Pretty-print: `node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('docs/api/swagger.json','utf8')); fs.writeFileSync('docs/api/swagger.json', JSON.stringify(d,null,2))"`
5. Verify: `node -e "const d=require('./docs/api/swagger.json'); console.log('Title:', d.info.title); console.log('Paths:', Object.keys(d.paths).length)"`
6. Commit: `git add docs/api/swagger.json && git commit -m "docs: export swagger.json"`
