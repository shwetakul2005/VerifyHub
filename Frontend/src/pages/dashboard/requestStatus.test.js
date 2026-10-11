import test from 'node:test';
import assert from 'node:assert/strict';
import { getRequestStatusMeta } from './requestStatus.js';

test('completed request without current step is handled as completed', () => {
  const meta = getRequestStatusMeta({
    status: 'completed',
    currentStep: null,
  });

  assert.equal(meta.isCompleted, true);
  assert.equal(meta.banner, 'Verification Completed');
  assert.equal(meta.message, 'Your verification request has been completed.');
});

test('rejected request without current step remains rejected', () => {
  const meta = getRequestStatusMeta({ status: 'rejected', currentStep: null });
  assert.equal(meta.isTerminal, true);
  assert.equal(meta.banner, 'Verification Rejected');
});

test('cancelled request is terminal and described accurately', () => {
  const meta = getRequestStatusMeta({ status: 'cancelled', currentStep: null });
  assert.equal(meta.isTerminal, true);
  assert.equal(meta.banner, 'Verification Cancelled');
});
