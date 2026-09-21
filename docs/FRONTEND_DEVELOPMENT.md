# Frontend Development & Git Workflow Guide

Refer to [frontend/README.md](file:///c:/Users/Administrator/Desktop/PetConnect/frontend/README.md) for the full guide.

## Quick Reference Commands

### Development
```bash
# Start Web App from root
npm run web

# Type Check
npm run typecheck
```

### Git Workflow Steps
```bash
# 1. Update local main
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feat/your-feature-name

# 3. Commit work
git add .
git commit -m "Describe your changes"

# 4. Push to GitHub
git push -u origin feat/your-feature-name

# 5. Merge PR on GitHub, then pull updated main locally
git checkout main
git pull origin main
```
