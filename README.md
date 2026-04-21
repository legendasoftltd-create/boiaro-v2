# 1. Clone and install
npm install
cd server && npm install && cd ..

# 2. Configure server environment
cp server/.env.example server/.env
# Edit server/.env with your production values:
#   DATABASE_URL=postgresql://...
#   JWT_SECRET=<64-char random hex>
#   JWT_REFRESH_SECRET=<64-char random hex>
#   NODE_ENV=production
#   CORS_ORIGIN=https://yourdomain.com

# 3. Run Prisma migrations
cd server && npx prisma db push && cd ..

# 4. Build everything
npm run build:full

# 5. Start production server (serves API + static frontend)
npm run server:start
# → Server on http://localhost:3001
# → Frontend at http://localhost:8080/
# → API at http://localhost:3001/trpc/...

# 6. Active login pages (4 unique):

# → http://localhost:8080/auth — Reader login + signup

# → http://localhost:8080/admin — Admin login (also the dashboard)
# → http://localhost:8080/creator-auth — Creator login + signup (writers, publishers, narrators)

# → http://localhost:8080/rj-auth — RJ login