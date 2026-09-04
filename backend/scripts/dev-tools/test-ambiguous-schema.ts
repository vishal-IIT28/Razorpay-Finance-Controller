import dotenv from 'dotenv';
import path from 'path';
import { detectFileSchema } from '../src/engine/schema-detector';

dotenv.config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });

async function testAmbiguousSchema() {
  console.log('🧪 Testing Genuinely Ambiguous CSV Schema Detection (LLM Fallback Path)...\n');

  // Genuinely ambiguous CSV without standard payment_id/utr/ledger_entry_id keywords
  const ambiguousBankCsv = `col_seq,event_time,line_item_memo,money_received,money_sent,remaining_funds,tracking_hash,channel_tag
BNK-88192,2026-08-14,SETTLEMENT CREDIT FOR MERCHANT 99201,1652.65,0.00,101652.65,TRK992018274619,ELECTRONIC
BNK-88193,2026-08-15,INWARD DIRECT DEPOSIT CLIENT ABC,4000.00,0.00,105652.65,TRK992018274620,ELECTRONIC
BNK-88194,2026-08-16,MONTHLY MAINTENANCE SERVICE CHARGE,0.00,50.00,105602.65,TRK992018274621,SYSTEM`;

  const ambiguousLedgerCsv = `record_no,bill_reference,target_receivable,collected_sum,counterparty_entity,deadline_stamp,filing_state,source_ref
REC-001,BILL-2026-991,1692.59,,Global Tech Ventures,2026-08-14,open,
REC-002,BILL-2026-992,4067.89,,Starlight Enterprises,2026-08-15,open,`;

  const testCases = [
    { filename: 'unlabeled_finance_export_1.csv', content: ambiguousBankCsv },
    { filename: 'erp_custom_query_export.csv', content: ambiguousLedgerCsv },
  ];

  for (const tc of testCases) {
    console.log(`================================================================================`);
    console.log(`📄 Filename: ${tc.filename}`);
    console.log(`Headers: ${tc.content.split('\n')[0]}`);
    console.log(`Sample Row: ${tc.content.split('\n')[1]}\n`);

    const result = await detectFileSchema(tc.filename, tc.content);

    console.log(`🎯 Detection Result:`);
    console.log(`  - Detected Role: \x1b[32m${result.role}\x1b[0m`);
    console.log(`  - Confidence:    ${result.confidence}`);
    console.log(`  - Detected Via:  \x1b[33m${result.detectedVia.toUpperCase()}\x1b[0m`);
    console.log(`  - LLM Reasoning: "${result.reasoning}"`);
    console.log(`  - Column Mapping:`);
    for (const [canonical, original] of Object.entries(result.mapping)) {
      console.log(`      ${canonical.padEnd(16)} -> ${original}`);
    }
    console.log();
  }
}

testAmbiguousSchema().catch(console.error);
