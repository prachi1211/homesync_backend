#!/bin/bash
# ============================================================
# HomeSync Backend — Additional Directory Structure
# Repository: homesync-backend
# 
# Prerequisites: npm init -y already run
# Run this from INSIDE the homesync-backend directory
# ============================================================

echo ""
echo "🚀 Setting up HomeSync backend directory structure..."
echo ""

# ── Source: Routes ──
mkdir -p src/routes
touch src/routes/.gitkeep

# ── Source: Controllers ──
mkdir -p src/controllers
touch src/controllers/.gitkeep

# ── Source: Config ──
mkdir -p src/config
touch src/config/.gitkeep

# ── Source: Middleware ──
mkdir -p src/middleware
touch src/middleware/.gitkeep

# ── Source: Utils ──
mkdir -p src/utils
touch src/utils/.gitkeep

# ── Source: Jobs (Cron) ──
mkdir -p src/jobs
touch src/jobs/.gitkeep

# ── Source: Email Templates ──
mkdir -p src/templates
touch src/templates/.gitkeep

# ── Tests: Unit ──
mkdir -p tests/unit/controllers
mkdir -p tests/unit/utils
mkdir -p tests/unit/middleware
touch tests/unit/controllers/.gitkeep
touch tests/unit/utils/.gitkeep
touch tests/unit/middleware/.gitkeep

# ── Tests: Integration ──
mkdir -p tests/integration/routes
touch tests/integration/routes/.gitkeep

# ── Database Migrations ──
mkdir -p migrations
touch migrations/.gitkeep

echo "✅ HomeSync backend directory structure created!"
echo ""
echo "Added to your project:"
echo ""
echo "src/"
echo "├── routes/              # Express route definitions"
echo "│   └── .gitkeep         # auth, household, grocery, chore, expense, etc."
echo "├── controllers/         # Request handlers (business logic)"
echo "│   └── .gitkeep"
echo "├── config/              # env.js, logger.js, database.js"
echo "│   └── .gitkeep"
echo "├── middleware/          # auth.js, householdAccess.js, errorHandler.js, validator.js"
echo "│   └── .gitkeep"
echo "├── utils/               # categorizer.js, balanceCalculator.js, emailService.js"
echo "│   └── .gitkeep"
echo "├── jobs/                # Cron: recurringExpenses, dailyDigest, budgetCheck"
echo "│   └── .gitkeep"
echo "└── templates/           # HTML email templates"
echo "    └── .gitkeep"
echo ""
echo "tests/"
echo "├── unit/"
echo "│   ├── controllers/"
echo "│   ├── utils/"
echo "│   └── middleware/"
echo "└── integration/"
echo "    └── routes/"
echo ""
echo "migrations/              # SQL migration files"
echo "    └── .gitkeep"
echo ""
echo "📋 Next steps:"
echo "   1. npm install express pg dotenv bcrypt jsonwebtoken cors"
echo "   2. npm install -D nodemon"
echo "   3. Create .env with DATABASE_URL, JWT_SECRET, etc."
echo "   4. Create src/server.js"
echo "   5. Add scripts to package.json:"
echo "      \"dev\": \"nodemon src/server.js\""
echo "      \"start\": \"node src/server.js\""
echo ""