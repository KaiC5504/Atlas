"""
Base class for Python workers.
Provides common functionality for all worker scripts.
"""
import sys
import traceback
from abc import ABC, abstractmethod
from typing import Any, Dict

from .json_io import read_input, write_output, write_error, write_log


class WorkerBase(ABC):
    """
    Abstract base class for all Python workers.

    Subclasses must implement the `process` method.
    The worker lifecycle is:
    1. Read JSON input from stdin
    2. Call process() with the input
    3. Write result to stdout (or error on failure)
    """

    _has_run = False  # Class-level flag to prevent multiple runs

    def __init__(self):
        self.input_data: Dict[str, Any] = {}

    @abstractmethod
    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process the input and return the result.

        Args:
            input_data: Dictionary containing the job parameters

        Returns:
            Dictionary containing the result data

        Raises:
            Exception: If processing fails
        """
        pass

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        """
        Validate the input data.
        Override this method to add custom validation.

        Args:
            input_data: Dictionary containing the job parameters

        Raises:
            ValueError: If validation fails
        """
        pass

    def run(self) -> int:
        """
        Main entry point for the worker.
        Reads input, processes, and writes output.

        Returns:
            Exit code (0 for success, 1 for failure)
        """
        import os

        # Prevent multiple runs in the same process
        if WorkerBase._has_run:
            write_log(f"WARNING: Worker.run() called multiple times! Ignoring.", level="warning")
            return 1
        WorkerBase._has_run = True

        try:
            # Log process info for debugging
            write_log(f"Worker PID: {os.getpid()}, Parent PID: {os.getppid()}")

            # Read input from stdin
            self.input_data = read_input()
            write_log(f"Worker started with input: {list(self.input_data.keys())}")

            # Check for empty input (likely a subprocess issue)
            if not self.input_data:
                write_log("WARNING: Empty input received - this may be a subprocess that shouldn't be running", level="warning")

            # Validate input
            self.validate_input(self.input_data)

            # Process the job
            result = self.process(self.input_data)

            # Write result to stdout
            write_output(result)
            write_log("Worker completed successfully")
            return 0

        except ValueError as e:
            write_error(f"Validation error: {e}")
            return 1
        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            write_error(error_msg)
            # Log full traceback for debugging
            write_log(traceback.format_exc(), level="error")
            return 1


def run_worker(worker_class: type) -> None:
    """
    Convenience function to create and run a worker.

    Usage:
        if __name__ == "__main__":
            run_worker(MyWorker)
    """
    worker = worker_class()
    exit_code = worker.run()
    sys.exit(exit_code)
