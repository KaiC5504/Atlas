"""
JSON I/O utilities for Python workers.
Handles communication with Rust via stdin/stdout.
"""
import json
import sys
import io
from typing import Any, Dict

# Ensure UTF-8 encoding for stdin/stdout on Windows
if sys.platform == 'win32':
    # Reconfigure stdin/stdout to use UTF-8
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)


def read_input() -> Dict[str, Any]:
    """
    Read JSON input from stdin.
    Returns the parsed JSON as a dictionary.
    """
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            return {}
        return json.loads(input_data)
    except json.JSONDecodeError as e:
        write_error(f"Invalid JSON input: {e}")
        sys.exit(1)


def write_output(data: Dict[str, Any]) -> None:
    """
    Write JSON output to stdout.
    This is the final result that Rust will read.
    """
    output = {
        "type": "result",
        "data": data
    }
    json_str = json.dumps(output, ensure_ascii=False)
    write_log(f"Result JSON size: {len(json_str)} bytes")
    print(json_str, flush=True)


def write_progress(percent: int, stage: str = "") -> None:
    """
    Write progress update to stdout.
    Rust will parse this and emit events to the UI.

    Args:
        percent: Progress percentage (0-100)
        stage: Optional stage description (e.g., "Processing segment 3/10")
    """
    output = {
        "type": "progress",
        "percent": max(0, min(100, percent)),
        "stage": stage
    }
    print(json.dumps(output, ensure_ascii=False), flush=True)


def write_error(message: str) -> None:
    """
    Write error message to stdout.
    Rust will parse this and mark the job as failed.
    """
    output = {
        "type": "error",
        "message": message
    }
    print(json.dumps(output, ensure_ascii=False), flush=True)


def write_log(message: str, level: str = "info") -> None:
    """
    Write log message to stdout.
    These are informational messages that won't affect job status.

    Args:
        message: Log message
        level: Log level (debug, info, warning, error)
    """
    output = {
        "type": "log",
        "level": level,
        "message": message
    }
    print(json.dumps(output, ensure_ascii=False), flush=True)
