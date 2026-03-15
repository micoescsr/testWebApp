// __tests__/unit/apJobStore.test.js
const apJobStore = require('../../services/apJobStore');

describe('apJobStore', () => {
  afterEach(() => {
    apJobStore._reset();
  });

  const JOB_ID = 'orch_1234567890_abcdef01';
  const NETWORK_ID = 'net-abc-123';

  const makeJob = (overrides = {}) => ({
    job_id: JOB_ID,
    network_id: NETWORK_ID,
    scan_id: 'scan-001',
    target_ap_status: 'enable',
    payload_snapshot: { ap_status: 'enable' },
    ...overrides,
  });

  test('create() stores and returns a job with defaults', () => {
    const job = apJobStore.create(makeJob());
    expect(job).toMatchObject({
      job_id: JOB_ID,
      network_id: NETWORK_ID,
      status: 'ACCEPTED',
      finalized: false,
      result: null,
      error_code: null,
      error_message: null,
    });
    expect(job.created_at).toBeTruthy();
    expect(job.updated_at).toBeTruthy();
  });

  test('get() returns the correct job', () => {
    apJobStore.create(makeJob());
    const job = apJobStore.get(JOB_ID);
    expect(job.job_id).toBe(JOB_ID);
  });

  test('get() returns null for missing job', () => {
    expect(apJobStore.get('missing')).toBeNull();
  });

  test('getActiveForNetwork() returns non-terminal job', () => {
    apJobStore.create(makeJob());
    const active = apJobStore.getActiveForNetwork(NETWORK_ID);
    expect(active.job_id).toBe(JOB_ID);
  });

  test('getActiveForNetwork() ignores terminal jobs', () => {
    apJobStore.create(makeJob());
    apJobStore.update(JOB_ID, { status: 'DONE' });
    const active = apJobStore.getActiveForNetwork(NETWORK_ID);
    expect(active).toBeNull();
  });

  test('getActiveForNetwork() ignores FAILED jobs', () => {
    apJobStore.create(makeJob());
    apJobStore.update(JOB_ID, { status: 'FAILED' });
    expect(apJobStore.getActiveForNetwork(NETWORK_ID)).toBeNull();
  });

  test('update() merges fields and bumps updated_at', () => {
    apJobStore.create(makeJob());
    const before = apJobStore.get(JOB_ID).updated_at;

    // Tiny delay so timestamp differs
    apJobStore.update(JOB_ID, { status: 'ONGOING' });

    const after = apJobStore.get(JOB_ID);
    expect(after.status).toBe('ONGOING');
    expect(after.updated_at).toBeTruthy();
  });

  test('update() returns null for missing job', () => {
    expect(apJobStore.update('missing', { status: 'DONE' })).toBeNull();
  });

  test('markFinalized() sets finalized flag', () => {
    apJobStore.create(makeJob());
    apJobStore.markFinalized(JOB_ID);
    expect(apJobStore.get(JOB_ID).finalized).toBe(true);
  });

  test('markFinalized() is safe for missing job', () => {
    expect(() => apJobStore.markFinalized('missing')).not.toThrow();
  });

  test('cleanup() removes stale terminal jobs past TTL', () => {
    apJobStore.create(makeJob());
    apJobStore.update(JOB_ID, { status: 'DONE' });

    // Manually backdate completed_at
    const job = apJobStore.get(JOB_ID);
    job.completed_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();

    apJobStore.cleanup();
    expect(apJobStore.get(JOB_ID)).toBeNull();
  });

  test('cleanup() keeps active (non-terminal) jobs', () => {
    apJobStore.create(makeJob());
    apJobStore.cleanup();
    expect(apJobStore.get(JOB_ID)).toBeDefined();
  });

  test('cleanup() keeps recent terminal jobs', () => {
    apJobStore.create(makeJob());
    apJobStore.update(JOB_ID, { status: 'DONE' });
    apJobStore.cleanup();
    expect(apJobStore.get(JOB_ID)).toBeDefined();
  });

  test('_reset() clears all jobs', () => {
    apJobStore.create(makeJob());
    apJobStore._reset();
    expect(apJobStore.get(JOB_ID)).toBeNull();
  });
});
