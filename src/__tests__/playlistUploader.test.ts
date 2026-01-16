import { describe, it, expect } from 'vitest'
import type { DownloadResult } from '../types/playlistUploader'

describe('DownloadResult type', () => {
  it('should have downloadedTrackIds field', () => {
    const result: DownloadResult = {
      success: true,
      downloaded: 1,
      cached: 0,
      failed: 0,
      total: 1,
      indexEntries: 1,
      playlistTracks: 1,
      downloadedTrackIds: ['abc123'],
      playlistName: 'Test',
    }
    expect(result.downloadedTrackIds).toEqual(['abc123'])
  })
})
