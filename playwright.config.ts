import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
dotenv.config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  /* Scans all subprojects */
  testDir: './projects',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  // workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    // ['html', { outputFolder: 'playwright-report' }], // Built-in HTML
    ['allure-playwright', {
        environmentInfo: {},
      },
    ], // Allure integration
  ],
  // TODO: Add summary-teardown.ts to generate summary visuals (more research is needed)
  // globalTeardown: './utils/summary-teardown.ts',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    screenshot: 'on',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
  },

  /* Configure projects for major browsers (chromium for now) */
  projects: [
    // --- Test Suites ---
    // Setup project (auth only)
    {
      name: 'Auth Setup - TEST',
      testMatch: /.*auth\.setup\.ts/,
    },
    // {
    //   name: 'Skulibrary Vendor Frontend (TD-1897 POC) - TEST',
    //   testMatch: /projects\/skulibrary-fe\/test-vendor\/.*\.spec\.ts/,
    //   use: { 
    //     ...devices['Desktop Chrome'], 
    //     /* Base URL to use in actions like `await page.goto('/')`. */
    //     baseURL: process.env.SKULIBRARY_FE_TEST_URL,
    //     storageState: 'projects/skulibrary-fe/.auth/test-vendor-state.json',
    //   },
    //   dependencies: ['Skulibrary Auth Setup - TEST'],
    // },
    // {
    //   name: 'Skulibrary VIS Frontend (TD-1897 POC) - TEST',
    //   testMatch: /projects\/skulibrary-fe\/test-vis\/.*\.spec\.ts/,
    //   use: { 
    //     ...devices['Desktop Chrome'], 
    //     /* Base URL to use in actions like `await page.goto('/')`. */
    //     baseURL: process.env.SKULIBRARY_FE_TEST_URL,
    //     storageState: 'projects/skulibrary-fe/.auth/test-vis-state.json',
    //   },
    //   dependencies: ['Skulibrary Auth Setup - TEST'],
    // },

    // {
    //   name: 'First Tests Check (Chromium)',
    //   testMatch: /projects\/a-sanity-check\/.*\.spec\.ts/,
    //   use: { 
    //     ...devices['Desktop Chrome'], 
    //   },
    // },
    {
      name: 'AI Score Tests - TEST',
      testMatch: /projects\/ai-score\/.*\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'], 
      },
    },
  ],
  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3001',
  //   reuseExistingServer: !process.env.CI,
  //   stdout: 'ignore',
  //   stderr: 'pipe',
  // },
});
