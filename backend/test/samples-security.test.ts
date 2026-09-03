import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import net from 'net';
import { app } from '../src/index';

describe('Sample Datasets Endpoint Security & Path Traversal Protection', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as net.AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should successfully serve allowlisted CSV for holdout dataset', async () => {
    const res = await fetch(`${baseUrl}/api/samples/holdout/razorpay_payments.csv`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/csv/);
    const text = await res.text();
    assert.ok(text.includes('payment_id'));
  });

  it('should successfully serve allowlisted CSV for default dataset', async () => {
    const res = await fetch(`${baseUrl}/api/samples/default/bank_statement.csv`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/csv/);
    const text = await res.text();
    assert.ok(text.includes('txn_id'));
  });

  it('should reject requests for ground_truth.json on holdout dataset', async () => {
    const res = await fetch(`${baseUrl}/api/samples/holdout/ground_truth.json`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Sample file not found' });
  });

  it('should reject requests for ground_truth.json on default dataset', async () => {
    const res = await fetch(`${baseUrl}/api/samples/default/ground_truth.json`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Sample file not found' });
  });

  it('should reject URL-encoded path traversal attempting to read .env', async () => {
    const res = await fetch(`${baseUrl}/api/samples/holdout/..%2F..%2F.env`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Sample file not found' });
  });

  it('should reject path traversal with relative dots', async () => {
    const res = await fetch(`${baseUrl}/api/samples/holdout/../../.env`);
    assert.ok(res.status === 404 || res.status === 400);
    const text = await res.text();
    assert.ok(!text.includes('GEMINI_API_KEY'));
    assert.ok(!text.includes('DATABASE_URL'));
  });

  it('should reject arbitrary non-allowlisted dataset names with 400', async () => {
    const res = await fetch(`${baseUrl}/api/samples/production/anything.csv`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Invalid dataset' });
  });

  it('should not leak server filesystem paths in any error responses', async () => {
    const res = await fetch(`${baseUrl}/api/samples/default/nonexistent_file.csv`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Sample file not found' });
    const stringified = JSON.stringify(body);
    assert.ok(!stringified.includes(':\\'));
    assert.ok(!stringified.includes('/Users/'));
    assert.ok(!stringified.includes('data'));
  });
});
