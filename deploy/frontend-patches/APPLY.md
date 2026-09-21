# Apply frontend Vercel upload changes

This agent could not push to `thisJavad98/cloud-storage` (403). Apply these patches in that repo:

```bash
cd cloud-storage
git checkout -b cursor/vercel-deploy-44af

# Copy patched files from this folder (or from the sibling PR branch)
cp ../cloud-storage-services/deploy/frontend-patches/services/files.js ./services/files.js
cp ../cloud-storage-services/deploy/frontend-patches/lib/api.js ./lib/api.js
cp ../cloud-storage-services/deploy/frontend-patches/.env.example ./.env.example
# Optional: refresh README deploy section
cp ../cloud-storage-services/deploy/frontend-patches/README.md ./README.md

npm install @vercel/blob@^1.1.1
git add -A
git commit -m "Use Vercel Blob client uploads for library files"
git push -u origin cursor/vercel-deploy-44af
```

Then on Vercel (frontend project), set:

```
NEXT_PUBLIC_API_URL=https://<api-project>.vercel.app/api
```
