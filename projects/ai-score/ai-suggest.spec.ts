import { test, request, expect, APIRequestContext } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { Buffer } from 'buffer';
import path from 'path';
import dotenv from 'dotenv';
import { getEnv } from '../../utils/helpers';
import { scoreProduct, AttributeSuggestion, ProductSuggestionResponse, ScoreBreakdown } from '../../utils/scorer';

dotenv.config();

const productsPath = path.resolve(__dirname, '../../data/products.json'); // array of objects [{ productCode, context }]

interface ProductEntry {
  productCode: string;
  context?: Record<string, any>;
}

type RawProduct = string | { productCode: string; context?: Record<string, any> };

function normalizeProducts(input: RawProduct[]): ProductEntry[] {
  return input.map((item) =>
    typeof item === 'string' ? { productCode: item } : { productCode: item.productCode, context: item.context },
  );
}

const rawProducts: RawProduct[] = JSON.parse(readFileSync(productsPath, 'utf-8'));
const products: ProductEntry[] = normalizeProducts(rawProducts);


if (!existsSync(productsPath)) {
  throw new Error(`Product list file not found at ${productsPath}`);
}

// Env variables
const IDENTITY_URL = getEnv('AI_SUGGESTIONS_AUTH_TEST_IDENTITY_URL');
const USERNAME = getEnv('AI_SUGGESTIONS_AUTH_TEST_USERNAME');
const PASSWORD = getEnv('AI_SUGGESTIONS_AUTH_TEST_PASS');
const PRODUCT_URL = getEnv('AI_SUGGESTIONS_AUTH_TEST_PRODUCT_URL');

// Will hold Authorization header after login
let authHeaders: Record<string, string> = {};

test.describe('AI OCR suggestions – scoring harness', () => {
  // Ensure per-product tests run one after another so the totals object is fully populated for the final aggregate test
  // TODO: Uncomment this when we have a way to run the tests in serial (but, the the statae is not fully shared correctly)
  // test.describe.configure({ mode: 'serial' });
  // Product suggestions can take ~45s; give buffer
  test.setTimeout(300_000); // 5 minutes
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await request.newContext({ ignoreHTTPSErrors: true });

    // Authenticate – form-data
    const loginResp = await api.post(`${IDENTITY_URL}/users/auth/login`, {
      multipart: {
        username: USERNAME,
        password: PASSWORD,
      },
    });
    if (!loginResp.ok()) {
      console.error('Login failed', loginResp.status(), await loginResp.text());
    }
    expect(loginResp.ok()).toBeTruthy();

    // Log cookies for debugging
    const cookies = await api.storageState();
    console.log('Auth cookies after login:', cookies.cookies.map(c => ({ name: c.name, domain: c.domain })));

    // Try to extract bearer token from response body (JSON or plain text)
    let token: string | undefined;
    try {
      const json: any = await loginResp.json();
      token = json?.access_token || json?.accessToken || json?.token;
    } catch {
      // Fallback to plain text body
      token = (await loginResp.text()).trim();
    }
    if (token) {
      authHeaders = { Authorization: `Bearer ${token}` };
      console.log('Using bearer token');
    } else {
      console.warn('No bearer token found in login response');
    }
    // Cookies / tokens are now stored inside `api` context
  });

  const totals: ScoreBreakdown = {
    correct: 0,
    incorrect: 0,
    hallucinated: 0,
    invalid: 0,
    missed: 0,
    score: 0,
  };

  // Collect per-product stats for summary visuals
  const productStats: Array<{ code: string; breakdown: ScoreBreakdown; totalQualifiers: number }> = [];

  for (const { productCode, context } of products) {
    test(`Product ${productCode}`, async ({}, testInfo) => {
      // 1. Retrieve baseline attributes via GET product
      const productResp = await api.get(`${PRODUCT_URL}/product/${productCode}`, { headers: authHeaders });
      expect(productResp.ok()).toBeTruthy();

      const productJson: any = await productResp.json();
      const classificationList: any[] = productJson.classificationAttributeList ?? [];

      const baseline: AttributeSuggestion[] = classificationList
        .filter((attr) => {
          const q: string = attr.fullQualifier ?? '';
          return (
            q === 'c_ingredients' ||
            q === 'c_servingSize' ||
            q === 'c_servingsPerPack' ||
            q.startsWith('c_nip')
          );
        })
        .map((attr) => ({ qualifier: attr.fullQualifier, proposedValue: String(attr.value) }));

      // 2. Call AI suggestion endpoint
      const query = `${PRODUCT_URL}/product/suggest/${productCode}/type/AI_OCR/generate?images=2&persistResponse=false`;

      const options: Record<string, any> = { headers: authHeaders, timeout: 240_000 };
      const bodyContext = (context && Object.keys(context).length > 0) ? context : undefined;
      if (bodyContext) {
        options.json = bodyContext;
      }

      const resp = await api.post(query, options);
      if (!resp.ok()) {
        console.warn(`Suggestion request failed for ${productCode}:`, resp.status());
      }
      const json = (await resp.json()) as ProductSuggestionResponse;

      const breakdown = scoreProduct(baseline, json);
      totals.correct += breakdown.correct;
      totals.incorrect += breakdown.incorrect;
      totals.hallucinated += breakdown.hallucinated;
      totals.invalid += breakdown.invalid;
      totals.missed += breakdown.missed;
      totals.score += breakdown.score;

      productStats.push({ code: productCode, breakdown, totalQualifiers: baseline.length });

      // Persist breakdown for cross-worker summary
      const summaryPath = path.resolve(__dirname, '../../data/summary-temp.json');
      let arr: any[] = [];
      try {
        if (existsSync(summaryPath)) {
          arr = JSON.parse(readFileSync(summaryPath, 'utf-8'));
        }
      } catch {}
      arr.push({ code: productCode, breakdown, totalQualifiers: baseline.length });
      try {
        require('fs').writeFileSync(summaryPath, JSON.stringify(arr, null, 2));
      } catch {}
      
      testInfo.attach('Baseline Endpoint Response', {
        body: JSON.stringify(productJson, null, 2),
        contentType: 'application/json',
      });

      testInfo.attach('AI Suggestion Endpoint Response', {
        body: JSON.stringify(json, null, 2),
        contentType: 'application/json',
      });

      testInfo.attach('Breakdown JSON Result', {
        body: JSON.stringify(bodyContext, null, 2),
        contentType: 'application/json',
      });

      testInfo.attach('Custom Context', {
        body: JSON.stringify(context, null, 2),
        contentType: 'application/json',
      });

      // Generate pie chart image via QuickChart and attach
      const chartConfig = {
        type: 'pie',
        data: {
          labels: ['Correct', 'Incorrect', 'Hallucinated', 'Invalid', 'Missed'],
          datasets: [
            {
              data: [
                breakdown.correct ? breakdown.correct : null,
                breakdown.incorrect ? breakdown.incorrect : null,
                breakdown.hallucinated ? breakdown.hallucinated : null,
                breakdown.invalid ? breakdown.invalid : null,
                breakdown.missed ? breakdown.missed : null,
              ],
              backgroundColor: [
                '#2ecc71', // green
                '#e74c3c', // red
                '#9b59b6', // purple
                '#f1c40f', // yellow
                '#95a5a6', // gray
              ],
            },
          ],
        },
      };

      const chartUrl = `https://quickchart.io/chart?bkg=white&format=png&c=${encodeURIComponent(
        JSON.stringify(chartConfig),
      )}`;

      try {
        const chartResp = await fetch(chartUrl);
        if (chartResp.ok) {
          const arrayBuffer = await chartResp.arrayBuffer();
          testInfo.attach('breakdown-pie', {
            body: Buffer.from(arrayBuffer),
            contentType: 'image/png',
          });
        } else {
          console.warn('Failed to fetch chart image', chartResp.status);
        }
      } catch (err) {
        console.warn('Error fetching chart image', err);
      }

      // Optional threshold – soft check so we don't abort the remaining product tests
      if (breakdown.score < 0) {
        console.warn(`Negative score for ${productCode}:`, breakdown);
      }
    });
  }


  // TODO: If needed, add summary-teardown.ts to generate summary visuals (more research is needed)
  // test.afterAll(async () => {
  //   console.log('\nSuite results:', totals);
  //   console.log('Product stats:', productStats);
  //   await api.dispose();

  //   // Summary / analysis attachment in afterAll using Allure API so parallel tests are fine
  //   const overallAccuracy = totals.correct / (totals.correct + totals.incorrect + totals.missed || 1);

  //   // Re-read aggregated stats from file to include workers data
  //   const summaryPath = path.resolve(__dirname, '../../data/summary-temp.json');
  //   let agg = productStats;
  //   if (existsSync(summaryPath)) {
  //     try {
  //       agg = JSON.parse(readFileSync(summaryPath, 'utf-8'));
  //     } catch {}
  //   }

  //   const productLabels = agg.map((p) => p.code ?? null);
  //   const productScores = agg.map((p) => p.breakdown.score ?? null);

  //   const scoreChartCfg = {
  //     type: 'bar',
  //     data: { labels: productLabels, datasets: [{ label: 'Score', data: productScores, backgroundColor: '#2d8cf0' }] },
  //     options: { scales: { y: { beginAtZero: true } } },
  //   };
  //   const scoreChartUrl = `https://quickchart.io/chart?bkg=white&format=png&c=${encodeURIComponent(JSON.stringify(scoreChartCfg))}`;

  //   const qualifierCounts = agg.map((p) => p.totalQualifiers);
  //   const qualChartCfg = {
  //     type: 'bar',
  //     data: { labels: productLabels, datasets: [{ label: 'Qualifiers Compared', data: qualifierCounts, backgroundColor: '#34c38f' }] },
  //     options: { indexAxis: 'y', scales: { x: { beginAtZero: true } } },
  //   };
  //   const qualChartUrl = `https://quickchart.io/chart?bkg=white&format=png&c=${encodeURIComponent(JSON.stringify(qualChartCfg))}`;

  //   const fetchChart = async (url: string) => {
  //     try {
  //       const resp = await fetch(url);
  //       if (resp.ok) return Buffer.from(await resp.arrayBuffer());
  //     } catch {}
  //     return undefined;
  //   };

  //   const [scorePng, qualPng] = await Promise.all([fetchChart(scoreChartUrl), fetchChart(qualChartUrl)]);

  //   // Use Allure api for attachments
  //   // eslint-disable-next-line @typescript-eslint/no-var-requires
  //   const allure = require('allure-playwright').allure;
  //   if (scorePng) allure.attachment('Product Scores', scorePng, 'image/png');
  //   if (qualPng) allure.attachment('Qualifiers per Product', qualPng, 'image/png');

  //   const rows = agg
  //     .map((p) => {
  //       const b = p.breakdown;
  //       return `<tr><td>${p.code}</td><td>${b.correct}</td><td>${b.incorrect}</td><td>${b.hallucinated}</td><td>${b.invalid}</td><td>${b.missed}</td><td>${b.score}</td></tr>`;
  //     })
  //     .join('\n');
  //   const html = `<!doctype html><html><head><style>table{border-collapse:collapse;font-family:Arial}td,th{border:1px solid #ddd;padding:4px;text-align:center}</style></head><body><h3>Summary and Analysis</h3><p>Overall Accuracy: ${(overallAccuracy * 100).toFixed(2)}%</p><table><thead><tr><th>Product</th><th>Correct</th><th>Incorrect</th><th>Hallucinated</th><th>Invalid</th><th>Missed</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;

  //   allure.attachment('Summary HTML', Buffer.from(html, 'utf-8'), 'text/html');
  // });
}); 