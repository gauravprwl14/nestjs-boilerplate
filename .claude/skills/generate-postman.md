# Generate Postman Collection

Convert the Swagger spec to a Postman collection.

## Prerequisites
- `docs/api/swagger.json` must exist (run `generate-swagger` skill first)

## Steps

1. Install converter if needed: `npx openapi-to-postmanv2 --help`
2. Convert: `npx openapi-to-postmanv2 -s docs/api/swagger.json -o docs/api/postman-collection.json -p`
3. Verify: `node -e "const d=require('./docs/api/postman-collection.json'); console.log('Collection:', d.info.name); console.log('Items:', d.item.length)"`
4. Commit: `git add docs/api/postman-collection.json && git commit -m "docs: generate postman collection from swagger"`
