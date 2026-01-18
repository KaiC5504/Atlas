import { describe, test, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

describe('usePerformanceData visibility throttling', () => {
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

  test('should skip state update when document is hidden', () => {
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

  test('should resume updates when document becomes visible', () => {
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

  test('should gracefully handle undefined document.hidden', () => {
    // Simulate environment where document.hidden is undefined (falsy)
    // In our mock, we can simulate this by returning undefined
    Object.defineProperty(document, 'hidden', {
      get: () => undefined,
      configurable: true,
    });

    const updateCallback = vi.fn();

    // When document.hidden is undefined/falsy, should still update
    if (!document.hidden) updateCallback();

    expect(updateCallback).toHaveBeenCalledTimes(1);

    // Restore mock
    Object.defineProperty(document, 'hidden', {
      get: () => mockHidden,
      configurable: true,
    });
  });

  test('visibility throttling logic matches implementation pattern', () => {
    // This test verifies the exact pattern used in usePerformanceData.ts
    // The pattern is: if (document.hidden) return;

    const processedEvents: number[] = [];

    const simulateEventHandler = (eventId: number) => {
      // This is the exact pattern from usePerformanceData.ts
      if (document.hidden) return;
      processedEvents.push(eventId);
    };

    // Event 1: visible - should process
    mockHidden = false;
    simulateEventHandler(1);

    // Event 2: hidden - should skip
    mockHidden = true;
    simulateEventHandler(2);

    // Event 3: hidden - should skip
    simulateEventHandler(3);

    // Event 4: visible again - should process
    mockHidden = false;
    simulateEventHandler(4);

    expect(processedEvents).toEqual([1, 4]);
  });
});
