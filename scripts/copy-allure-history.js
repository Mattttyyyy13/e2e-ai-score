const fs = require('fs');
const path = require('path');
const fse = fs.promises;

(async () => {
  const reportHistoryPath = path.resolve(__dirname, '../allure-report/history');
  const resultsHistoryPath = path.resolve(__dirname, '../allure-results/history');

  try {
    // Ensure previous history exists
    await fse.access(reportHistoryPath);
  } catch {
    console.log('No existing allure-report/history directory to copy');
    return;
  }

  try {
    // Remove existing history in results if present
    await fse.rm(resultsHistoryPath, { recursive: true, force: true });
    // Ensure allure-results directory exists
    await fse.mkdir(path.dirname(resultsHistoryPath), { recursive: true });
    // Copy directory recursively
    await copyDir(reportHistoryPath, resultsHistoryPath);
    console.log('Copied previous history to allure-results');
  } catch (err) {
    console.error('Failed to copy allure history', err);
    process.exitCode = 1;
  }
})();

async function copyDir(src, dest) {
  const entries = await fse.readdir(src, { withFileTypes: true });
  await fse.mkdir(dest, { recursive: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else if (entry.isSymbolicLink()) {
        const link = await fse.readlink(srcPath);
        await fse.symlink(link, destPath);
      } else {
        await fse.copyFile(srcPath, destPath);
      }
    }),
  );
} 