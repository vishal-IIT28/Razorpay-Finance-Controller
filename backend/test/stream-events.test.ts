import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineManager, PipelineEvent } from '../src/engine/pipeline-runner';

describe('SSE Streaming & Pipeline Event Manager', () => {
  it('should buffer and sequence pipeline events in chronological order', () => {
    const manager = new PipelineManager();
    const runId = 'test-run-uuid-123';

    const events: PipelineEvent[] = [
      {
        type: 'pipeline_init',
        runId,
        timestamp: new Date().toISOString(),
        data: { total_records: 100 },
      },
      {
        type: 'pass1_complete',
        runId,
        timestamp: new Date().toISOString(),
        data: { matched_count: 50, pass1_ms: 12.5 },
      },
      {
        type: 'pass2_complete',
        runId,
        timestamp: new Date().toISOString(),
        data: { matched_count: 30, pass2_ms: 45.2 },
      },
      {
        type: 'pass3_progress',
        runId,
        timestamp: new Date().toISOString(),
        data: {
          current_index: 1,
          total_records: 20,
          payment_id: 'pay_xyz999',
          matched: true,
          status: 'matched',
          reasoning: 'Fee variance explained by deduction code',
        },
      },
      {
        type: 'reconcile_complete',
        runId,
        timestamp: new Date().toISOString(),
        data: {
          total_records: 100,
          matched_count: 90,
          match_rate: 90.0,
          duration_ms: 1250,
        },
      },
    ];

    for (const evt of events) {
      manager.emitPipelineEvent(evt);
    }

    const history = manager.getEventHistory(runId);
    assert.equal(history.length, 5);
    assert.equal(history[0].type, 'pipeline_init');
    assert.equal(history[1].type, 'pass1_complete');
    assert.equal(history[2].type, 'pass2_complete');
    assert.equal(history[3].type, 'pass3_progress');
    assert.equal(history[4].type, 'reconcile_complete');

    // Verify per-record progress payload fields
    const progressEvt = history[3];
    assert.equal(progressEvt.data.payment_id, 'pay_xyz999');
    assert.equal(progressEvt.data.matched, true);
    assert.equal(progressEvt.data.status, 'matched');
  });

  it('should deliver real-time events to active run subscribers', (t, done) => {
    const manager = new PipelineManager();
    const runId = 'test-run-sub-456';
    const received: PipelineEvent[] = [];

    manager.on(`run:${runId}`, (event: PipelineEvent) => {
      received.push(event);
      if (event.type === 'reconcile_complete') {
        assert.equal(received.length, 2);
        assert.equal(received[0].type, 'pass1_complete');
        assert.equal(received[1].type, 'reconcile_complete');
        done();
      }
    });

    manager.emitPipelineEvent({
      type: 'pass1_complete',
      runId,
      timestamp: new Date().toISOString(),
      data: { matched_count: 60 },
    });

    manager.emitPipelineEvent({
      type: 'reconcile_complete',
      runId,
      timestamp: new Date().toISOString(),
      data: { matched_count: 85 },
    });
  });

  it('should isolate event histories between different run IDs', () => {
    const manager = new PipelineManager();
    const runA = 'run-aaa-111';
    const runB = 'run-bbb-222';

    manager.emitPipelineEvent({
      type: 'pass1_complete',
      runId: runA,
      timestamp: new Date().toISOString(),
      data: { run: 'A' },
    });

    manager.emitPipelineEvent({
      type: 'pass2_complete',
      runId: runB,
      timestamp: new Date().toISOString(),
      data: { run: 'B' },
    });

    const historyA = manager.getEventHistory(runA);
    const historyB = manager.getEventHistory(runB);

    assert.equal(historyA.length, 1);
    assert.equal(historyA[0].data.run, 'A');

    assert.equal(historyB.length, 1);
    assert.equal(historyB[0].data.run, 'B');
  });
});
