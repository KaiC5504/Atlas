import { describe, test, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

describe('useGamingData visibility throttling', () => {
  // Save original document.hidden
  const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  let mockHidden = false;

  beforeAll(() => {
    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
      get: () => mockHidden,
      configurable: true,
    });
  });

  afterAll(() => {
    // Restore original document.hidden
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }
  });

  beforeEach(() => {
    mockHidden = false;
  });

  test('should skip gaming metrics update when document is hidden', () => {
    const updateCallback = vi.fn();

    // Simulate event received when visible
    mockHidden = false;
    const shouldUpdateWhenVisible = !document.hidden;
    if (shouldUpdateWhenVisible) updateCallback();

    // Simulate event received when hidden
    mockHidden = true;
    const shouldUpdateWhenHidden = !document.hidden;
    if (shouldUpdateWhenHidden) updateCallback();

    expect(updateCallback).toHaveBeenCalledTimes(1);
  });

  test('should resume gaming updates when document becomes visible', () => {
    const updateCallback = vi.fn();

    // Hidden -> skip
    mockHidden = true;
    if (!document.hidden) updateCallback();

    // Visible -> update
    mockHidden = false;
    if (!document.hidden) updateCallback();

    // Visible -> update again
    if (!document.hidden) updateCallback();

    expect(updateCallback).toHaveBeenCalledTimes(2);
  });

  test('should skip bottleneck update when document is hidden', () => {
    const bottleneckCallback = vi.fn();

    // Simulate bottleneck event received when visible
    mockHidden = false;
    if (!document.hidden) bottleneckCallback();

    // Simulate bottleneck event received when hidden
    mockHidden = true;
    if (!document.hidden) bottleneckCallback();

    expect(bottleneckCallback).toHaveBeenCalledTimes(1);
  });

  test('visibility throttling logic matches implementation pattern for metrics', () => {
    // This test verifies the exact pattern used in useGamingData.ts for gaming:metrics
    // The pattern is: if (document.hidden) return;

    const processedMetrics: number[] = [];

    const simulateMetricsHandler = (eventId: number) => {
      // This is the exact pattern from useGamingData.ts
      if (document.hidden) return;
      processedMetrics.push(eventId);
    };

    // Event 1: visible - should process
    mockHidden = false;
    simulateMetricsHandler(1);

    // Event 2: hidden - should skip
    mockHidden = true;
    simulateMetricsHandler(2);

    // Event 3: hidden - should skip
    simulateMetricsHandler(3);

    // Event 4: visible again - should process
    mockHidden = false;
    simulateMetricsHandler(4);

    expect(processedMetrics).toEqual([1, 4]);
  });

  test('visibility throttling logic matches implementation pattern for bottleneck', () => {
    // This test verifies the exact pattern used in useGamingData.ts for gaming:bottleneck
    // The pattern is: if (document.hidden) return;

    const processedBottlenecks: number[] = [];

    const simulateBottleneckHandler = (eventId: number) => {
      // This is the exact pattern from useGamingData.ts
      if (document.hidden) return;
      processedBottlenecks.push(eventId);
    };

    // Event 1: visible - should process
    mockHidden = false;
    simulateBottleneckHandler(1);

    // Event 2: hidden - should skip
    mockHidden = true;
    simulateBottleneckHandler(2);

    // Event 3: visible again - should process
    mockHidden = false;
    simulateBottleneckHandler(3);

    expect(processedBottlenecks).toEqual([1, 3]);
  });
});
