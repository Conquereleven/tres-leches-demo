# PR #66 Operations Chromium CI timeout evidence

This note records the two canceled Chromium jobs from [Operations mobile regression run 40306394591](https://github.com/Conquereleven/tres-leches-demo/actions/runs/40306394591). Both used the exact PR #66 head `3e1fd5d9c3c46f63500cf9f8231dfce5b9ea982c`. The full job logs remain attached to GitHub Actions; this note preserves the relevant timings without copying fixture output.

| Job | Runner start (UTC) | `playwright install --with-deps chromium` start → browser ready | 82-test suite start | GitHub cancellation |
| --- | --- | --- | --- | --- |
| [121516452844](https://github.com/Conquereleven/tres-leches-demo/actions/runs/40306394591/job/121516452844) | 10:18:43 | 10:19:20 → 10:31:42 | 10:31:45 | 10:38:58 |
| [121528211123](https://github.com/Conquereleven/tres-leches-demo/actions/runs/40306394591/job/121528211123) | 10:45:48 | 10:46:18 → 10:58:14 | 10:58:17 | 11:06:03 |

In both jobs, system dependency/browser setup consumed about 12 minutes, leaving about 7–8 minutes under the 20-minute job cap for the 82 Chromium scenarios. GitHub ended each with `The operation was canceled`; neither log reports a failed assertion. The WebKit matrix job succeeded. On the same branch, all 82 Chromium Operations scenarios passed locally in 6.1 minutes using the repository's unchanged fixtures.

Correction: `.github/workflows/operations-regression.yml` now bounds the job at 35 minutes and omits routine `DEBUG: pw:browser` output. The existing Playwright trace, failure context and artifact upload remain active on failure. The browser matrix, all scenarios, assertions, fixtures and application code are unchanged.
