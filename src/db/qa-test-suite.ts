
interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  statusCode: number;
  message: string;
  durationMs: number;
}

const BASE_URL = 'http://localhost:5001/api/v1';

async function runQaSuite() {
  console.log('========================================================================');
  console.log('🏥 SENIOR QA TESTER: FULL HOSPITAL CRM AUTOMATED AUDIT SUITE');
  console.log('========================================================================\n');

  const results: TestResult[] = [];
  let authToken = '';

  // Helper fetcher
  async function testApi(
    name: string,
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    expectedStatus = 200
  ): Promise<any> {
    const start = Date.now();
    try {
      const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const durationMs = Date.now() - start;
      const json = await res.json().catch(() => null);

      const isPass = res.status === expectedStatus || (expectedStatus === 200 && res.status === 201);
      results.push({
        endpoint: `[${name}] ${method} ${path}`,
        method,
        status: isPass ? 'PASS' : 'FAIL',
        statusCode: res.status,
        message: isPass ? ((json as any)?.message || 'OK') : `Expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(json)}`,
        durationMs,
      });

      return json;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      results.push({
        endpoint: `${method} ${path}`,
        method,
        status: 'FAIL',
        statusCode: 0,
        message: err.message,
        durationMs,
      });
      return null;
    }
  }

  console.log('--- 1. Testing Authentication & User Management ---');
  const loginRes = await testApi(
    'Login as Chief Pharmacist',
    '/auth/login',
    'POST',
    { email: 'ananya.sen@hospital.com', password: 'Pharma#Lead2026!' },
    200
  );
  if (loginRes?.data?.token) {
    authToken = loginRes.data.token;
    console.log(`  ✓ Auth token acquired for Ananya Sen (${loginRes.data.user?.role})`);
  }
  await testApi('Verify /auth/me profile session', '/auth/me', 'GET', undefined, 200);

  console.log('\n--- 2. Testing Executive Dashboard & KPIs ---');
  await testApi('Dashboard Overview', '/dashboard/overview', 'GET', undefined, 200);
  await testApi('Auto-create Reorder PR', '/dashboard/auto-create-reorder-pr', 'POST', {}, 200);

  console.log('\n--- 3. Testing Hospital Stores & Multi-Store Switcher ---');
  const storesRes = await testApi('List all active hospital stores', '/stores', 'GET', undefined, 200);
  console.log(`  ✓ Found ${storesRes?.data?.length || 0} active hospital stores in DB`);

  console.log('\n--- 4. Testing Universal Smart Scanner & Barcode Lookup ---');
  await testApi('Lookup Medication Code DRG-00105', '/barcode/lookup', 'POST', { query: 'DRG-00105' }, 200);
  await testApi('Lookup Batch Number BAT-00105-25C', '/barcode/lookup', 'POST', { query: 'BAT-00105-25C' }, 200);
  await testApi('Lookup GS1-128 DataMatrix Barcode', '/barcode/lookup', 'POST', { query: '(01)08901234567890(17)261231(10)BAT-00105-25F(21)SN9001' }, 200);

  console.log('\n--- 5. Testing Items & Formulary Master Catalog ---');
  const itemsRes = await testApi('Get Formulary Items (Paginated)', '/items?page=1&limit=10', 'GET', undefined, 200);
  const sampleItemId = itemsRes?.data?.items?.[0]?.id || 2;
  await testApi(`Get Item Details (ID: ${sampleItemId})`, `/items/${sampleItemId}`, 'GET', undefined, 200);
  await testApi(`Stock Adjustment (ID: ${sampleItemId})`, `/items/${sampleItemId}/adjust`, 'POST', {
    adjustmentType: 'Physical Count Reconciliation',
    quantity: 10,
    reason: 'QA Audit Batch Count Test',
    notes: 'Verified against shelf count',
  }, 200);

  console.log('\n--- 6. Testing Ward & Department Indents ---');
  await testApi('List Indents', '/indents', 'GET', undefined, 200);
  await testApi('Get Indent Lookups', '/indents/lookups', 'GET', undefined, 200);
  const newIndent = await testApi('Create New Indent', '/indents', 'POST', {
    department: 'ICU Ward',
    priority: 'High',
    notes: 'QA Automated Test Indent',
    toStore: 'Apex Pharmacy & Cold Chain Store',
    items: [
      { itemId: sampleItemId, requestedQty: 15, currentStock: 40 }
    ]
  }, 201);
  if (newIndent?.data?.id) {
    await testApi(`Fulfill Indent #${newIndent.data.id}`, `/indents/${newIndent.data.id}/fulfill`, 'PATCH', {}, 200);
  }

  console.log('\n--- 7. Testing Purchase Requests & Approvals Workflow ---');
  await testApi('List PRs', '/purchase-requests', 'GET', undefined, 200);
  await testApi('PR Lookups', '/purchase-requests/lookups', 'GET', undefined, 200);
  const newPr = await testApi('Create New PR', '/purchase-requests', 'POST', {
    department: 'Central Store',
    priority: 'Emergency',
    justification: 'Critical QA Stock Replenishment',
    items: [
      { itemId: sampleItemId, requestedQuantity: 50, estimatedCost: 24250, remarks: 'Urgent ICU reserve' }
    ]
  }, 201);

  if (newPr?.data?.id) {
    const prId = newPr.data.id;
    await testApi(`Approve PR #${prId} - L1 Head`, `/purchase-requests/${prId}/approve-l1`, 'PATCH', {}, 200);
    await testApi(`Approve PR #${prId} - CFO/CPO`, `/purchase-requests/${prId}/approve-cfo`, 'PATCH', {}, 200);
    await testApi(`Convert Approved PR #${prId} to PO`, `/purchase-requests/${prId}/convert-to-po`, 'POST', { vendorId: 1 }, 200);
  }

  console.log('\n--- 8. Testing RFQ & Quotes Bidding System ---');
  const rfqRes = await testApi('List RFQs & Quotes', '/rfq-quotes', 'GET', undefined, 200);
  const sampleRfqId = rfqRes?.data?.[0]?.id || 1;
  await testApi(`Award RFQ #${sampleRfqId} to L1 Vendor`, `/rfq-quotes/${sampleRfqId}/award`, 'POST', { vendorId: 1 }, 200);

  console.log('\n--- 9. Testing Purchase Orders Lifecycle ---');
  const poRes = await testApi('List Purchase Orders', '/purchase-orders', 'GET', undefined, 200);
  const samplePoId = poRes?.data?.purchaseOrders?.[0]?.id || poRes?.data?.orders?.[0]?.id || 1;
  await testApi(`Get PO Details #${samplePoId}`, `/purchase-orders/${samplePoId}`, 'GET', undefined, 200);

  console.log('\n--- 10. Testing Inbound Consignment, GRN & QC ---');
  await testApi('List GRNs', '/grn', 'GET', undefined, 200);
  await testApi('GRN Lookups', '/grn/lookups', 'GET', undefined, 200);
  const scanGrnRes = await testApi('Scan Delivery Barcode Check-in', '/grn/scan', 'POST', {
    barcode: '(01)08901234567890(17)261231(10)BAT-00105-25F(21)SN9001',
    invoiceNo: 'INV-QA-2026',
    temperature: 4.5,
  }, 200);
  if (scanGrnRes?.data?.grnId) {
    await testApi(`Perform QC Inspection on GRN #${scanGrnRes.data.grnId}`, `/grn/${scanGrnRes.data.grnId}/inspect`, 'PATCH', {
      action: 'accept',
      inspectedQty: 100,
      acceptedQty: 100,
      rejectedQty: 0,
      qcNotes: 'QA Inspection Assay Verified',
    }, 200);
  }

  console.log('\n--- 11. Testing Internal Stock Transfers & Issues ---');
  await testApi('List Transfers & Issues', '/transfers', 'GET', undefined, 200);
  await testApi('Transfers Lookups', '/transfers/lookups', 'GET', undefined, 200);
  await testApi('Record Ward Dispensing Issue', '/transfers/issue', 'POST', {
    issueType: 'Ward Issue',
    toDestination: 'ICU Ward',
    itemId: sampleItemId,
    quantity: 5,
    patientId: 'PT-9021',
  }, 201);
  await testApi('Initiate Store-to-Store Stock Transfer', '/transfers/transfer', 'POST', {
    fromStore: 'Central Warehouse & Main Drug Store',
    toStore: 'Apex Pharmacy & Cold Chain Store',
    itemId: sampleItemId,
    quantity: 20,
    vehicleType: 'Internal Tug Cart',
  }, 201);

  console.log('\n--- 12. Testing Invoices, 3-Way Match & Payments ---');
  await testApi('List Invoices', '/invoices', 'GET', undefined, 200);
  await testApi('Process Payment Batch Settlement', '/invoices/settle-batch', 'POST', {
    invoiceIds: [1, 2],
    paymentMethod: 'NEFT Corporate Transfer',
    bankReference: 'UTR-QA-99887766',
  }, 200);

  console.log('\n--- 13. Testing Biomedical Assets & AMC Maintenance ---');
  await testApi('Get Assets KPIs', '/assets/kpis', 'GET', undefined, 200);
  const assetsRes = await testApi('List Biomedical Assets', '/assets', 'GET', undefined, 200);
  const sampleAssetId = assetsRes?.data?.items?.[0]?.id || 1;
  await testApi('Log Preventive Maintenance Ticket', '/assets/maintenance', 'POST', {
    assetId: sampleAssetId,
    maintenanceType: 'preventive',
    serviceDate: new Date().toISOString().split('T')[0],
    technicianName: 'BioMed Engineer Rajesh',
    vendorName: 'Siemens Healthineers',
    cost: 15000,
    issueDescription: 'Quarterly calibration and collimator inspection',
  }, 200);

  console.log('\n--- 14. Testing Vendor Master Directory ---');
  await testApi('List Vendors', '/vendors', 'GET', undefined, 200);
  await testApi('Register New Hospital Vendor', '/vendors', 'POST', {
    name: 'Apollo Medical Supplies Corp',
    category: 'Consumables & PPE',
    contact_email: 'procure@apollomed.com',
    phone: '+91 98765 43210',
    grade: 'A',
    payment_terms: 'Net 45',
  }, 201);

  console.log('\n--- 15. Testing Reports & Analytics Engine ---');
  await testApi('Reports KPIs', '/reports/kpis', 'GET', undefined, 200);
  await testApi('Reports Trends', '/reports/trends', 'GET', undefined, 200);
  await testApi('List Generated Reports', '/reports/generated', 'GET', undefined, 200);

  console.log('\n--- 16. Testing Hospital Notifications & Telemetry ---');
  await testApi('Fetch Telemetry Notifications', '/notifications', 'GET', undefined, 200);
  await testApi('Mark All Notifications Read', '/notifications/mark-all-read', 'PATCH', {}, 200);

  console.log('\n--- 17. Testing Hospital System Configuration & Settings ---');
  await testApi('Get Hospital Configurations', '/settings/config', 'GET', undefined, 200);
  await testApi('Update Hospital Department Thresholds', '/settings/config', 'PUT', {
    hospitalName: 'Apex Multi-Speciality Tertiary Care Hospital',
    taxGstNumber: '07AAAAA0000A1Z5',
    currency: 'INR (₹)',
    emergencyReorderLeadDays: 2,
    autoApproveEmergencyIndents: true,
  }, 200);

  console.log('\n========================================================================');
  console.log('📊 SENIOR QA TEST SUITE AUDIT SUMMARY');
  console.log('========================================================================');

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${r.status}] [${r.statusCode}] ${r.endpoint} (${r.durationMs}ms) - ${r.message.slice(0, 80)}`);
    if (r.status === 'PASS') passed++;
    else failed++;
  }

  console.log(`\nTotal Tests Executed: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runQaSuite().catch((err) => {
  console.error('Fatal QA Suite Error:', err);
  process.exit(1);
});
