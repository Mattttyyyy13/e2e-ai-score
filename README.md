# E2E-TEST MONOREPO

A unified Playwright end-to-end (E2E) test suite that validates our **Skulibrary** AI-integrated related apps.  
The repository is designed to be approachable for both engineers _and_ non-technical stakeholders – every test run generates an **Allure** report that can be browsed on GitHub Pages (Or if hosted officially somewhere).

---

## 1  Repository Layout  (Can be changed in the future)

```
./
├── projects/                 # All test code lives here, grouped by projects
│   ├── a-sanity-check/       # Quick connectivity / smoke checks
│   ├── *project-name*/       # Tests for the project name
│   │   ├── *env-userType*/   # Env: Test, User_Type: any | contains test cases
│   │   ├── *env-userType*/   # Env: Test, User_Type: any | contains test cases
│   │   ├── *env-userType*/   # Env: Test, User_Type: any | contains test cases
│   │   └── *.setup.ts        # Login helpers (storageState)
│   └── backoffice-fe/        # Tests for FE Backoffice (suggested)
│   └── microservices/        # Tests for microservices (suggested)
│
├── utils/                    # Cross-test helpers (env, fixtures, data builders…etc)
├── scripts/                  # One-off maintenance scripts
├── playwright.config.ts      # Global + per-project Playwright settings
└── README.md                 # 👉 you are here
```


---

© 2025 Mattttyyyy - With heart
