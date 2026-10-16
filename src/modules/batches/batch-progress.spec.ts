import {
  batchProgressMessage,
  batchProgressSnapshot,
  batchStageKey,
} from './batch-progress';

describe('batchProgressSnapshot', () => {
  it('is indeterminate when the claim total is unknown', () => {
    expect(batchProgressSnapshot('processing', 0, 0)).toEqual({
      mode: 'indeterminate',
      processed: 0,
      total: 0,
      percentage: null,
    });
  });

  it('counts processed claims without reporting 100 while any remain pending', () => {
    expect(batchProgressSnapshot('validating', 19, 7)).toEqual({
      mode: 'counted',
      processed: 12,
      total: 19,
      percentage: 63,
    });
  });

  it('reports 100 only when a completed status has no pending claims', () => {
    expect(batchProgressSnapshot('validated', 19, 0).percentage).toBe(100);
    expect(batchProgressSnapshot('validated', 19, 2).percentage).toBe(89);
    expect(batchProgressSnapshot('parsed', 19, 0).percentage).toBe(99);
  });

  it('does not divide by zero', () => {
    expect(batchProgressSnapshot('validating', 0, 5).percentage).toBeNull();
  });
});

describe('batch stage labels', () => {
  it('maps stored statuses onto display stages without renaming them', () => {
    expect(batchStageKey('validating')).toBe('validating');
    expect(batchStageKey('validated')).toBe('validation_complete');
    expect(batchProgressMessage('validating')).toBe('Validating claims.');
    expect(batchProgressMessage('error')).not.toMatch(/stack|sql|exception/i);
  });
});
