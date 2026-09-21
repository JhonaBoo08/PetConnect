# PetConnect - Frontend Development Guide

Welcome to the **PetConnect Frontend**. This guide covers how to run, develop, and contribute to the frontend codebase.

---

## 📁 Directory Structure

```
frontend/
├── assets/             # Images, fonts, and static assets
├── src/
│   ├── app/            # Expo Router pages and navigation stack
│   ├── components/     # Reusable UI components
│   ├── constants/      # Color palettes, theme tokens, styling constants
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Navigation & helper functions
│   └── services/       # Firebase Client & Auth services
├── app.json            # Expo App configuration
├── package.json        # Frontend dependencies & scripts
└── tsconfig.json       # TypeScript path aliases (@/*)
```

---

## 🚀 Getting Started

### 1. Install Dependencies
From the repository root, install dependencies for the frontend:
```bash
npm --prefix frontend install
```

### 2. Run the Development Server
You can start the web application directly from the root workspace or inside the `frontend/` directory:

**From the Root Workspace:**
```bash
npm run web
```

**From the `frontend/` Directory:**
```bash
cd frontend
npm run web
```

To run on iOS or Android emulators:
```bash
npm run ios
npm run android
```

### 3. Type Checking
Before pushing changes, run TypeScript type checking to verify no errors exist:
```bash
npm run typecheck
```

---

## 🌿 Git & GitHub Contribution Workflow

When contributing changes to the frontend, **do not push directly to the `main` branch**. Follow this step-by-step workflow:

### Step 1: Switch to `main` and Pull Latest Changes
Always ensure your local `main` branch is up to date before starting new work:
```bash
git checkout main
git pull origin main
```

### Step 2: Create a Feature Branch
Create and switch to a descriptive feature branch:
```bash
git checkout -b feat/your-feature-name
```
> *Example:* `git checkout -b feat/pet-profile-screen`

### Step 3: Make Your Code Changes
Develop your feature or bug fix in the `frontend/` directory.

### Step 4: Verify Your Changes
Ensure the app builds and has no TypeScript or linting errors:
```bash
npm run typecheck
```

### Step 5: Stage and Commit Changes
Stage your modified files and write a clear commit message:
```bash
git add .
git commit -m "Add pet profile screen and update dashboard navigation"
```

### Step 6: Push Branch to GitHub
Push your branch to the remote GitHub repository:
```bash
git push -u origin feat/your-feature-name
```

### Step 7: Create a Pull Request (PR) & Merge
1. Open GitHub and navigate to the repository.
2. Click **Compare & pull request** for your newly pushed branch.
3. Review the diff and submit the Pull Request into `main`.
4. Once reviewed and approved, merge the Pull Request on GitHub.

### Step 8: Update Your Local Repository
After merging the PR on GitHub, pull the updated `main` branch back to your local machine:
```bash
git checkout main
git pull origin main
```

---

## 🛠️ Summary Checklist

| Action | Command |
| :--- | :--- |
| **Start Web Server** | `npm run web` |
| **Check Types** | `npm run typecheck` |
| **Create Branch** | `git checkout -b feat/<name>` |
| **Commit Work** | `git add . && git commit -m "..."` |
| **Push to GitHub** | `git push -u origin feat/<name>` |
| **Pull Main** | `git checkout main && git pull origin main` |
