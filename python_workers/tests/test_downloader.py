def test_download_result_uses_downloaded_track_ids_key():
    # Simulate a download result structure
    result = {
        'successful': 1,
        'cached': 0,
        'failed': 0,
        'total': 1,
        'downloaded_track_ids': ['abc123'],
    }
    assert 'downloaded_track_ids' in result
    assert 'new_track_ids' not in result
    assert result['downloaded_track_ids'] == ['abc123']
