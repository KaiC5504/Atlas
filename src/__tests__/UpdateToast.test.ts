import { describe, it, expect } from 'vitest'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const BYTES_PER_UNIT = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT));
  return parseFloat((bytes / Math.pow(BYTES_PER_UNIT, unitIndex)).toFixed(1)) + ' ' + sizes[unitIndex];
}

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
  it('should format KB', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })
  it('should format MB', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })
  it('should format GB', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
  })
})
