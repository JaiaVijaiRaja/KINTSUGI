import { test, expect } from '@playwright/test';

test.describe('Test Journey I: Phase 12 Reconstruction Evidence Integrity & Schema Alignment', () => {
  test('I-01: Verifies zero vs unmeasured score distinction, missing breakdown banner, distance & anomaly status columns', async ({ page }) => {
    // Mock pipelines and runs to ensure test repeatability
    await page.route('**/api/pipelines', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pipelines: [
            {
              configuration_id: 'cfg_phase12_test',
              configuration_name: 'Phase 12 Calibration Pipeline',
              configuration_version: 1,
              dataset_id: 'ds_test',
              sensor_columns: ['vibration_x', 'temperature_y'],
              confidence_policy: {
                review_threshold: 0.6,
                human_review_required: false,
                min_evidence_sensors: 1,
                unjustified_behavior: 'abstain_unresolved',
              },
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route('**/api/datasets', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          datasets: [
            {
              dataset_id: 'ds_test',
              filename: 'telemetry_sample.csv',
              file_size_bytes: 1024,
              row_count: 100,
              column_count: 4,
              columns: ['timestamp', 'vibration_x', 'vibration_y', 'temperature_y'],
              uploaded_at: '2026-10-25T16:00:00Z',
              parsing_status: 'ready',
              quality_available: true,
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route('**/api/pipelines/*/runs*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runs: [
            {
              run_id: 'det_phase12_test',
              dataset_id: 'ds_test',
              configuration_id: 'cfg_phase12_test',
              configuration_version: 1,
              status: 'completed',
              start_time: '2026-10-25T16:00:00Z',
              detector_methods: ['statistical', 'isolation_forest'],
              summary: {
                total_rows_analyzed: 100,
                total_anomalies_detected: 2,
                anomalies_by_sensor: { vibration_x: 1, temperature_y: 1 },
                anomalies_by_detector: {},
                anomalies_by_severity: {},
                multi_detector_consensus_count: 1,
                unusable_rows_count: 0,
              },
              errors: [],
              warnings: [],
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route('**/api/reconstruction/runs*', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            runs: [
              {
                reconstruction_run_id: 'rec_phase12_run',
                detection_run_id: 'det_phase12_test',
                pipeline_id: 'cfg_phase12_test',
                dataset_id: 'ds_test',
                configuration_version: 1,
                status: 'completed',
                start_time: '2026-10-25T16:00:00Z',
                summary: {
                  total_evaluated: 2,
                  measured_count: 0,
                  estimated_count: 1,
                  corrected_count: 1,
                  unresolved_count: 1,
                  average_confidence: 45.0,
                  anomalies_reconstructed_count: 1,
                  by_sensor: { vibration_x: { CORRECTED: 1 }, temperature_y: { UNRESOLVED: 1 } },
                  by_method: { cross_sensor: 1 },
                },
                errors: [],
                warnings: [],
              },
            ],
            total: 1,
          }),
        });
      } else {
        route.continue();
      }
    });

    // Mock results endpoint returning Record 1 (CORRECTED with zero, nonzero, null, omitted scores + evidence)
    // and Record 2 (UNRESOLVED with completely missing confidence breakdown)
    await page.route('**/api/reconstruction/runs/rec_phase12_run/results*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reconstruction_run_id: 'rec_phase12_run',
          detection_run_id: 'det_phase12_test',
          pipeline_id: 'cfg_phase12_test',
          dataset_id: 'ds_test',
          summary: {
            total_evaluated: 2,
            measured_count: 0,
            estimated_count: 1,
            corrected_count: 1,
            unresolved_count: 1,
            average_confidence: 45.0,
            anomalies_reconstructed_count: 1,
            by_sensor: {},
            by_method: {},
          },
          total_results: 2,
          results: [
            {
              result_id: 'rec_res_corr_01',
              reconstruction_run_id: 'rec_phase12_run',
              detection_run_id: 'det_phase12_test',
              dataset_id: 'ds_test',
              configuration_id: 'cfg_phase12_test',
              sensor_column: 'vibration_x',
              source_row_index: 10,
              timestamp: '2026-10-25T16:00:10Z',
              original_value: 99.9,
              proposed_value: 12.4,
              final_value: 12.4,
              method: 'cross_sensor',
              status: 'CORRECTED',
              confidence_score: 90.0,
              confidence_breakdown: {
                neighbor_count_score: 0.0, // Scenario 1: Real score of 0
                method_agreement_score: 22.5, // Scenario 2: Valid nonzero score
                temporal_proximity_score: null, // Scenario 3: Null confidence factor score
                // Scenario 4: local_variance_score is omitted entirely
                neighbor_cleanliness_score: 12.0,
                cross_sensor_score: 14.0,
                total_score: 90.0,
                penalty_reasons: ['Zero neighbor count penalty applied'],
              },
              evidence_summary: 'Corroborated by cross-sensor models',
              evidence_references: [
                {
                  source_row_index: 9,
                  sensor_column: 'vibration_x',
                  value: 12.3,
                  distance: 1.0,
                  weight: 0.85,
                  is_anomaly: false,
                },
                {
                  source_row_index: 11,
                  sensor_column: 'vibration_y',
                  value: 45.1,
                  distance: 3.5,
                  weight: 0.70,
                  is_anomaly: true,
                },
              ],
              abstention_reason: null,
              is_reviewed: false,
              created_at: '2026-10-25T16:00:10Z',
            },
            {
              result_id: 'rec_res_unres_02',
              reconstruction_run_id: 'rec_phase12_run',
              detection_run_id: 'det_phase12_test',
              dataset_id: 'ds_test',
              configuration_id: 'cfg_phase12_test',
              sensor_column: 'temperature_y',
              source_row_index: 55,
              timestamp: '2026-10-25T16:00:55Z',
              original_value: 142.1,
              proposed_value: null,
              final_value: 142.1,
              method: 'none',
              status: 'UNRESOLVED',
              confidence_score: 0.0,
              confidence_breakdown: null, // Scenario 5: Completely missing confidence breakdown
              evidence_summary: 'Abstained due to sensor corruption',
              evidence_references: [],
              abstention_reason: 'Abstained: Insufficient Confidence. Sensor unmeasurable.',
              is_reviewed: false,
              created_at: '2026-10-25T16:00:55Z',
            },
          ],
          limit: 50,
          offset: 0,
        }),
      });
    });

    await page.goto('/reconstruction');

    // Verify page title
    await expect(page.getByRole('heading', { name: /Reconstruction Studio/i })).toBeVisible({ timeout: 10000 });

    // Wait for the results table to render both rows
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(2, { timeout: 10000 });

    // --- TEST RECORD 1 (CORRECTED): Zero vs Nonzero vs Null vs Omitted & Evidence Table ---
    const firstRowInspectBtn = rows.nth(0).getByRole('button', { name: /Inspect/i });
    await firstRowInspectBtn.click();

    // Verify Evidence Inspector modal opens without runtime error
    await expect(page.getByRole('heading', { name: /Evidence Inspector/i })).toBeVisible();
    await expect(page.getByText('Evidence Factor Decomposition')).toBeVisible();

    // Scenario 1: Valid zero score displays as "+0.0 / 25" (NOT "Unmeasured" and NOT blank)
    await expect(page.getByText('+0.0 / 25')).toBeVisible();

    // Scenario 2: Valid nonzero score displays its actual value "+22.5 / 25"
    await expect(page.getByText('+22.5 / 25')).toBeVisible();

    // Scenario 3 & 4: Null and omitted factor scores display as "Unmeasured"
    const unmeasuredBadges = page.locator('span:text("Unmeasured")');
    // Both temporal_proximity_score (null) and local_variance_score (omitted) must render "Unmeasured"
    await expect(unmeasuredBadges.first()).toBeVisible();
    const unmeasuredCount = await unmeasuredBadges.count();
    expect(unmeasuredCount).toBeGreaterThanOrEqual(2);

    // Scenario 5 check for Record 1: should show penalty reason
    await expect(page.getByText('Zero neighbor count penalty applied')).toBeVisible();

    // Scenario 6: Evidence reference table columns (Distance, Anomaly Status)
    await expect(page.locator('th:has-text("Distance")')).toBeVisible();
    await expect(page.locator('th:has-text("Anomaly Status")')).toBeVisible();
    // Verify distance values rendered
    await expect(page.getByText('1.0 rows')).toBeVisible();
    await expect(page.getByText('3.5 rows')).toBeVisible();
    // Verify anomaly status badges
    await expect(page.getByText('Nominal', { exact: true })).toBeVisible();
    await expect(page.getByText('Flagged', { exact: true })).toBeVisible();

    // Close the modal
    const closeBtn = page.locator('div.fixed button:has(svg.lucide-x)').first();
    await closeBtn.click();
    await expect(page.getByRole('heading', { name: /Evidence Inspector/i })).not.toBeVisible();

    // --- TEST RECORD 2 (UNRESOLVED): Completely missing confidence breakdown ---
    const secondRowInspectBtn = rows.nth(1).getByRole('button', { name: /Inspect/i });
    await secondRowInspectBtn.click();

    await expect(page.getByRole('heading', { name: /Evidence Inspector/i })).toBeVisible();

    const modal = page.locator('div.fixed');
    // Verify Abstention reason notice is shown
    await expect(modal.getByText(/Abstention Reason:/i)).toBeVisible();
    await expect(modal.getByText(/Insufficient Confidence/i)).toBeVisible();

    // Verify completely missing breakdown does NOT render 6 deceptive zero cards,
    // but instead displays the explicit Unmeasured banner
    await expect(
      modal.getByText('Evidence breakdown telemetry is unavailable for this observation. Factors are unmeasured.')
    ).toBeVisible();

    // Verify no deceptive factor score cards are shown when breakdown is unmeasured
    await expect(modal.getByText('+0.0 / 25')).not.toBeVisible();

    // Close modal cleanly
    await closeBtn.click();
    await expect(page.getByRole('heading', { name: /Evidence Inspector/i })).not.toBeVisible();
  });
});
