/**
 * Evaluate Gold Packaging Extraction Results
 *
 * Loads the gold dataset, fetches latest successful extractiosn from
 * product_packaging_extractions, runs composePackagingTitle() for each,
 * and reports field accuracy, title accuracy, confidence metrics, and
 * extraction success rate.
 *
 * Usage:
 *   bun run scripts/packaging/evaluate-gold-results.ts
 *   bun run scripts/packaging/evaluate-gold-results.ts --enforce-gates
 *   bun run scripts/packaging/evaluate-gold-results.ts --source=gold_dataset.json
 *   bun run scripts/packaging/evaluate-gold-results.ts --output=./reports/gold-001
 */

import { createAdminClient } from '../../lib/supabase/server';
import { composePackagingTitle } from '../../lib/packaging/title-composer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

// =============================================================================
// Types
// =============================================================================

interface GoldEntry {
  id: string;
  upc: string;
  image_urls: string[];
  expected_facts: Record<string, string | null>;
  expected_title: string;
  current_draft_title?: string;
  auto_apply_expected?: boolean;
  tags?: string[];
  [key: string]: unknown;
}

interface ExtractionRow {
  id: string;
  upc: string;
  status: string;
  model: string | null;
  raw_text: string | null;
  structured_facts: Record<string, unknown> | null;
  field_confidence: Record<string, unknown> | null;
  overall_confidence: number | null;
  image_urls: string[];
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

interface FieldResult {
  field: string;
  expected: string | null;
  got: string | null;
  match: boolean;
  conf: number;
}

interface EvaluationReport {
  timestamp: string;
  total: number;
  extracted: number;
  extraction_success_rate: number;
  field_accuracy: Record<string, { correct: number; total: number; pct: number }>;
  title_exact_matches: number;
  title_partial_matches: number;
  title_accuracy_pct: number;
  auto_eligible_simulated: number;
  false_overrides_simulated: number;
  false_override_rate: number;
  conflict_rate: number;
  latency_stats: {
    p50_seconds: number | null;
    p95_seconds: number | null;
  };
  error_breakdown: Record<string, number>;
  details: Array<{
    upc: string;
    expected_title: string;
    got_title: string | null;
    extraction_ok: boolean;
    auto_eligible: boolean;
    skip_reason?: string;
  }>;
}

// =============================================================================
// Helpers
// =============================================================================

function normalizeStr(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function isTitleMatch(expected: string, got: string | null): boolean {
  if (!got) return false;
  const e = normalizeStr(expected);
  const g = normalizeStr(got);
  if (e === g) return 'exact';
  // Token-level overlap
  const eTokens = new Set(e.split(/\s+/));
  const gTokens = g.split(/\s+/);
  const overlap = gTokens.filter((t) => eTokens.has(t)).length;
  const maxLen = Math.max(eTokens.size, gTokens.size);
  return overlap / maxLen >= 0.7;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const enforceGates = args.includes('--enforce-gates');
  const sourceArg = args.find((a) => a.startsWith('--source='));
  const outputArg = args.find((a) => a.startsWith('--output='));

  const sourceFile = sourceArg ? sourceArg.split('=')[1] : 'gold_dataset.json';
  const reportDir = outputArg
    ? path.resolve(outputArg)
    : path.resolve(__dirname, '../../../apps/scraper/benchmarks/packaging_vision/reports');

  // Load gold dataset
  const goldPaths = [
    path.resolve(__dirname, '../../../apps/scraper/benchmarks/packaging_vision', sourceFile),
    path.resolve(__dirname, '../../../apps/scraper/benchmarks/packaging_vision/gold_dataset.json'),
  ];

  let gold: { entries: GoldEntry[] };
  for (const p of goldPaths) {
    try {
      gold = JSON.parse(readFileSync(p, 'utf-8'));
      console.log(`Loaded ${gold.entries.length} gold entries from ${p}`);
      break;
    } catch { continue; }
  }

  if (!gold!) {
    console.error('Could not load gold dataset');
    process.exit(1);
  }

  // Filter to gold-status entries
  const goldEntries = gold.entries.filter((e) => e.verification_status === 'gold');
  const candidateEntries = gold.entries.filter((e) => e.verification_status !== 'gold');

  console.log(`Gold: ${goldEntries.length}, Candidate: ${candidateEntries.length}`);

  if (goldEntries.length === 0 && enforceGates) {
    console.error('--enforce-gates requires at least 1 gold entry');
    process.exit(1);
  }

  // Skip if no gold entries
  if (goldEntries.length === 0) {
    console.log('No gold entries to evaluate. Add reviewed entries first.');
    return;
  }

  const supabase = await createAdminClient();

  // Fetch latest successful extractions for gold UPCs
  const upcs = goldEntries.map((e) => e.upc);
  const { data: extractions, error: fetchError } = await supabase
    .from('product_packaging_extractions')
    .select('*')
    .in('upc', upcs)
    .eq('status', 'succeeded')
    .eq('is_stale', false)
    .order('completed_at', { ascending: false });

  if (fetchError) {
    console.error('Failed to fetch extractions:', fetchError.message);
    process.exit(1);
  }

  const extractionByUpc = new Map<string, ExtractionRow>();
  if (extractions) {
    for (const row of extractions) {
      if (!extractionByUpc.has(row.upc)) {
        extractionByUpc.set(row.upc, row as ExtractionRow);
      }
    }
  }

  // Evaluate
  const fieldTotals: Record<string, { correct: number; total: number }> = {};
  let titleExact = 0;
  let titlePartial = 0;
  let autoEligibleSim = 0;
  let falseOverridesSim = 0;
  let conflicts = 0;
  const latencies: number[] = [];
  const errorBreakdown: Record<string, number> = {};
  const details: EvaluationReport['details'] = [];

  for (const entry of goldEntries) {
    const ext = extractionByUpc.get(entry.upc);
    const detail: EvaluationReport['details'][number] = {
      upc: entry.upc,
      expected_title: entry.expected_title,
      got_title: null,
      extraction_ok: false,
      auto_eligible: false,
    };

    if (!ext) {
      // Check if there's a failed extraction
      const { data: failedExt } = await supabase
        .from('product_packaging_extractions')
        .select('error_code, status')
        .eq('upc', entry.upc)
        .neq('status', 'succeeded')
        .limit(1)
        .maybeSingle();

      const reason = failedExt
        ? `extraction ${failedExt.status}`
        : 'no extraction found';
      detail.skip_reason = reason;
      const code = failedExt?.error_code || 'not_found';
      errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
      details.push(detail);
      continue;
    }

    detail.extraction_ok = true;
    const facts = ext.structured_facts || {};
    const fieldConf = ext.field_confidence || {};
    const overallConf = ext.overall_confidence;

    // Track latency
    if (ext.started_at && ext.completed_at) {
      const latency = (new Date(ext.completed_at).getTime() - new Date(ext.started_at).getTime()) / 1000;
      latencies.push(latency);
    }

    // Field-level accuracy
    for (const [field, expected] of Object.entries(entry.expected_facts)) {
      if (!fieldTotals[field]) fieldTotals[field] = { correct: 0, total: 0 };
      fieldTotals[field].total++;

      const got = facts[field] as string | null | undefined;
      const conf = (fieldConf[field] as number | undefined) || 0;

      if (expected && got && normalizeStr(expected) === normalizeStr(got)) {
        fieldTotals[field].correct++;
      } else if (!expected && (!got || conf < 0.3)) {
        // Expected absent/irrelevant and extraction agrees
        fieldTotals[field].correct++;
      }
    }

    // Run title composer
    const suggestion = composePackagingTitle({
      facts: facts as Record<string, string>,
      fieldConfidence: fieldConf as Record<string, number>,
      consolidationDraftCore: {
        name: entry.current_draft_title || entry.expected_title,
      },
    });

    const composerTitle = suggestion?.title || null;
    detail.got_title = composerTitle;

    // Title accuracy
    if (composerTitle && normalizeStr(composerTitle) === normalizeStr(entry.expected_title)) {
      titleExact++;
    } else if (composerTitle && isTitleMatch(entry.expected_title, composerTitle)) {
      titlePartial++;
    }

    // Auto-apply simulation
    if (overallConf && overallConf >= 0.85) {
      autoEligibleSim++;
    }

    // False override detection
    if (entry.current_draft_title && composerTitle) {
      const draftNorm = normalizeStr(entry.current_draft_title);
      const composerNorm = normalizeStr(composerTitle);
      const expectedNorm = normalizeStr(entry.expected_title);

      if (draftNorm !== composerNorm && composerNorm !== expectedNorm) {
        falseOverridesSim++;
      }
    }

    // Conflicts
    if (suggestion?.conflicts?.length) {
      conflicts += suggestion.conflicts.length;
    }

    details.push(detail);
  }

  // Build report
  const total = goldEntries.length;
  const extracted = extractionByUpc.size;
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const fieldAccuracy: Record<string, { correct: number; total: number; pct: number }> = {};
  for (const [field, { correct, total: tot }] of Object.entries(fieldTotals)) {
    fieldAccuracy[field] = {
      correct,
      total: tot,
      pct: Math.round((correct / tot) * 10000) / 100,
    };
  }

  const sortedLatencies = latencies.slice().sort((a, b) => a - b);
  const report: EvaluationReport = {
    timestamp: now,
    total,
    extracted,
    extraction_success_rate: Math.round((extracted / total) * 10000) / 100,
    field_accuracy: fieldAccuracy,
    title_exact_matches: titleExact,
    title_partial_matches: titlePartial,
    title_accuracy_pct: total ? Math.round(((titleExact + titlePartial) / total) * 10000) / 100 : 0,
    auto_eligible_simulated: autoEligibleSim,
    false_overrides_simulated: falseOverridesSim,
    false_override_rate: total ? Math.round((falseOverridesSim / total) * 10000) / 100 : 0,
    conflict_rate: total ? Math.round((conflicts / total) * 10000) / 100 : 0,
    latency_stats: {
      p50_seconds: sortedLatencies.length > 0
        ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] : null,
      p95_seconds: sortedLatencies.length > 0
        ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : null,
    },
    error_breakdown: errorBreakdown,
    details,
  };

  // Write report files
  const timestamp = now.replace(/[T:]/g, '-').slice(0, 19);
  mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `${timestamp}.json`);
  const mdPath = path.join(reportDir, `${timestamp}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`JSON report: ${jsonPath}`);

  // Write markdown summary
  const md = generateMarkdown(report, goldEntries.length, candidateEntries.length);
  writeFileSync(mdPath, md, 'utf-8');
  console.log(`Markdown report: ${mdPath}`);

  // Print summary
  console.log(`\n===== Gold Benchmark Summary =====`);
  console.log(`Extraction success: ${report.extraction_success_rate}%`);
  console.log(`Title accuracy (exact): ${(titleExact / total * 100).toFixed(1)}%`);
  console.log(`Title accuracy (partial): ${((titleExact + titlePartial) / total * 100).toFixed(1)}%`);
  console.log(`Auto-eligible: ${autoEligibleSim}/${total}`);
  console.log(`False override rate: ${report.false_override_rate}%`);
  console.log(`Conflicts per gold entry: ${report.conflict_rate}`);
  if (report.latency_stats.p95_seconds) {
    console.log(`Latency p50: ${report.latency_stats.p50_seconds}s  p95: ${report.latency_stats.p95_seconds}s`);
  }

  // Gate enforcement
  if (enforceGates) {
    const gates = {
      extraction_success: report.extraction_success_rate >= 90,
      brand_accuracy: (fieldAccuracy.brand?.pct ?? 0) >= 95,
      size_weight_accuracy: (
        (fieldAccuracy.size?.pct ?? 100) >= 90 &&
        (fieldAccuracy.weight?.pct ?? 100) >= 90
      ),
      false_override_rate: report.false_override_rate <= 1,
      p95_latency: !report.latency_stats.p95_seconds || report.latency_stats.p95_seconds <= 180,
    };

    const allPass = Object.values(gates).every(Boolean);
    console.log(`\n--enforce-gates: ${allPass ? 'ALL PASS' : 'FAIL'}`);
    for (const [gate, pass] of Object.entries(gates)) {
      console.log(`  ${gate}: ${pass ? 'PASS' : 'FAIL'}`);
    }

    if (!allPass) {
      process.exit(1);
    }
  }
}

function generateMarkdown(report: EvaluationReport, goldCount: number, candidateCount: number): string {
  const lines: string[] = [];
  lines.push(`# Gold Benchmark Report — ${report.timestamp}`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Gold entries | ${report.total} |`);
  lines.push(`| Candidate entries | ${candidateCount} |`);
  lines.push(`| Extractions found | ${report.extracted} |`);
  lines.push(`| Extraction success rate | ${report.extraction_success_rate}% |`);
  lines.push(`| Title exact matches | ${report.title_exact_matches} |`);
  lines.push(`| Title partial matches | ${report.title_partial_matches} |`);
  lines.push(`| Title accuracy | ${report.title_accuracy_pct}% |`);
  lines.push(`| Auto-eligible (simulated) | ${report.auto_eligible_simulated} |`);
  lines.push(`| False override rate | ${report.false_override_rate}% |`);
  lines.push(`| Conflict rate | ${report.conflict_rate} |`);
  if (report.latency_stats.p50_seconds) lines.push(`| Latency p50 | ${report.latency_stats.p50_seconds}s |`);
  if (report.latency_stats.p95_seconds) lines.push(`| Latency p95 | ${report.latency_stats.p95_seconds}s |`);
  lines.push('');

  lines.push('## Field Accuracy');
  lines.push('| Field | Correct | Total | Accuracy |');
  lines.push('|-------|---------|-------|----------|');
  for (const [field, stats] of Object.entries(report.field_accuracy).sort()) {
    lines.push(`| ${field} | ${stats.correct} | ${stats.total} | ${stats.pct}% |`);
  }
  lines.push('');

  lines.push('## Error Breakdown');
  lines.push('| Error | Count |');
  lines.push('|-------|-------|');
  for (const [code, count] of Object.entries(report.error_breakdown).sort()) {
    lines.push(`| ${code} | ${count} |`);
  }
  lines.push('');

  lines.push('## Detail (first 20)');
  lines.push('| UPC | Extraction | Auto-eligible | Got Title | Expected Title |');
  lines.push('|-----|-----------|--------------|-----------|----------------|');
  for (const d of report.details.slice(0, 20)) {
    const ok = d.extraction_ok ? '✅' : (d.skip_reason ? `❌ ${d.skip_reason}` : '❌');
    const autoOk = d.auto_eligible ? '✅' : ' ';
    const gotTitle = (d.got_title || '').slice(0, 50);
    const expTitle = (d.expected_title || '').slice(0, 50);
    lines.push(`| ${d.upc} | ${ok} | ${autoOk} | ${gotTitle} | ${expTitle} |`);
  }
  lines.push('');

  return lines.join('\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
