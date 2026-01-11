"""
SSH Worker for Atlas
Executes SSH commands on remote servers and streams output.
Also supports SFTP file uploads.
"""
import json
import sys
import re
import os
from typing import Any, Dict

from common.worker_base import WorkerBase, run_worker
from common.json_io import write_log, write_progress

# Import paramiko for SSH connections
try:
    import paramiko
except ImportError:
    # Write error and exit if paramiko is not installed
    print(json.dumps({
        "type": "error",
        "message": "paramiko package not installed. Run: pip install paramiko"
    }), flush=True)
    sys.exit(1)




class SSHWorker(WorkerBase):
    """
    Worker for executing SSH commands on remote servers.

    Input format for command execution:
    {
        "host": "server_ip",
        "port": 22,
        "username": "user",
        "password": "password",
        "command": "shell command",
        "session_id": "uuid"
    }

    Input format for system status:
    {
        "host": "server_ip",
        "port": 22,
        "username": "user",
        "password": "password",
        "action": "system_status"
    }

    Input format for file upload:
    {
        "host": "server_ip",
        "port": 22,
        "username": "user",
        "password": "password",
        "action": "upload_file",
        "local_path": "/path/to/local/file",
        "remote_path": "/path/to/remote/file"
    }
    """

    def __init__(self):
        super().__init__()
        self.client: paramiko.SSHClient = None

    def validate_input(self, input_data: Dict[str, Any]) -> None:
        """Validate SSH connection parameters."""
        required_fields = ["host", "port", "username", "password"]

        for field in required_fields:
            if field not in input_data:
                raise ValueError(f"Missing required field: {field}")

        # Either command or action must be provided
        if "command" not in input_data and "action" not in input_data:
            raise ValueError("Either 'command' or 'action' must be provided")

    def connect(self, host: str, port: int, username: str, password: str) -> None:
        """Establish SSH connection."""
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        write_log(f"Connecting to {username}@{host}:{port}")

        try:
            self.client.connect(
                hostname=host,
                port=port,
                username=username,
                password=password,
                timeout=30,
                allow_agent=False,
                look_for_keys=False
            )
            write_log("SSH connection established")
        except paramiko.AuthenticationException:
            raise ValueError("SSH authentication failed. Check username and password.")
        except paramiko.SSHException as e:
            raise ValueError(f"SSH connection error: {e}")
        except Exception as e:
            raise ValueError(f"Failed to connect: {e}")

    def disconnect(self) -> None:
        """Close SSH connection."""
        if self.client:
            self.client.close()
            write_log("SSH connection closed")

    def execute_command(self, command: str) -> Dict[str, Any]:
        """
        Execute a shell command and stream output.
        Returns the full output and exit code.
        """
        write_log(f"Executing command: {command}")

        # Execute command
        stdin, stdout, stderr = self.client.exec_command(command)

        output_lines = []
        error_lines = []

        # Stream stdout
        for line in stdout:
            line_text = line.rstrip('\n\r')
            output_lines.append(line_text)
            write_log(line_text, level="stdout")

        # Stream stderr
        for line in stderr:
            line_text = line.rstrip('\n\r')
            error_lines.append(line_text)
            write_log(line_text, level="stderr")

        # Get exit code
        exit_code = stdout.channel.recv_exit_status()

        return {
            "output": "\n".join(output_lines),
            "error": "\n".join(error_lines) if error_lines else None,
            "exit_code": exit_code
        }

    def get_system_status(self) -> Dict[str, Any]:
        """Get system status information from the server."""
        write_log("Fetching system status")

        status = {
            "uptime": "Unknown",
            "load_average": "Unknown",
            "memory_used": "Unknown",
            "memory_total": "Unknown",
            "disk_used": "Unknown",
            "disk_total": "Unknown",
            "cpu_usage": "Unknown"
        }

        try:
            # Get uptime and load average
            _, stdout, _ = self.client.exec_command("uptime")
            uptime_output = stdout.read().decode().strip()

            # Parse uptime
            uptime_match = re.search(r'up\s+(.+?),\s+\d+\s+user', uptime_output)
            if uptime_match:
                status["uptime"] = uptime_match.group(1)

            # Parse load average
            load_match = re.search(r'load average:\s+([\d.]+)', uptime_output)
            if load_match:
                status["load_average"] = load_match.group(1)

            # Get memory info
            _, stdout, _ = self.client.exec_command("free -h | grep Mem")
            mem_output = stdout.read().decode().strip()
            mem_parts = mem_output.split()
            if len(mem_parts) >= 3:
                status["memory_total"] = mem_parts[1]
                status["memory_used"] = mem_parts[2]

            # Get disk usage
            _, stdout, _ = self.client.exec_command("df -h / | tail -1")
            disk_output = stdout.read().decode().strip()
            disk_parts = disk_output.split()
            if len(disk_parts) >= 4:
                status["disk_total"] = disk_parts[1]
                status["disk_used"] = disk_parts[2]

            # Get CPU usage (simple approach using top)
            _, stdout, _ = self.client.exec_command("top -bn1 | grep 'Cpu(s)' | head -1")
            cpu_output = stdout.read().decode().strip()
            cpu_match = re.search(r'(\d+\.?\d*)\s*%?\s*id', cpu_output)
            if cpu_match:
                idle = float(cpu_match.group(1))
                status["cpu_usage"] = f"{100 - idle:.1f}%"

            write_log("System status fetched successfully")

        except Exception as e:
            write_log(f"Error fetching system status: {e}", level="warning")

        return status

    def upload_file(self, local_path: str, remote_path: str) -> Dict[str, Any]:
        """
        Upload a file to the remote server via SFTP.
        Returns upload status and file info.
        """
        write_log(f"Starting SFTP upload: {local_path} -> {remote_path}")

        # Check if local file exists
        if not os.path.exists(local_path):
            raise ValueError(f"Local file not found: {local_path}")

        # Get file size for progress reporting
        file_size = os.path.getsize(local_path)
        file_name = os.path.basename(local_path)

        write_log(f"File size: {file_size / (1024 * 1024):.2f} MB")

        try:
            # Open SFTP session
            sftp = self.client.open_sftp()

            # Track upload progress
            uploaded_bytes = [0]  # Use list to allow mutation in callback
            last_percent = [0]

            def progress_callback(transferred: int, total: int):
                uploaded_bytes[0] = transferred
                percent = int((transferred / total) * 100)
                # Only log every 10%
                if percent >= last_percent[0] + 10 or percent == 100:
                    last_percent[0] = percent
                    write_progress(percent, f"Uploading {file_name}: {percent}%")
                    write_log(f"Upload progress: {transferred / (1024 * 1024):.2f} MB / {total / (1024 * 1024):.2f} MB ({percent}%)")

            # Upload the file
            sftp.put(local_path, remote_path, callback=progress_callback)

            # Verify upload by checking remote file size
            remote_stat = sftp.stat(remote_path)
            remote_size = remote_stat.st_size

            sftp.close()

            if remote_size != file_size:
                raise ValueError(f"Upload verification failed: local size {file_size} != remote size {remote_size}")

            write_log(f"Upload complete: {remote_path} ({remote_size / (1024 * 1024):.2f} MB)")

            return {
                "success": True,
                "local_path": local_path,
                "remote_path": remote_path,
                "file_size": file_size,
                "file_name": file_name
            }

        except Exception as e:
            raise ValueError(f"SFTP upload failed: {e}")

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process the SSH request."""
        host = input_data["host"]
        port = input_data["port"]
        username = input_data["username"]
        password = input_data["password"]

        try:
            # Connect to the server
            self.connect(host, port, username, password)

            # Check what action to perform
            action = input_data.get("action")

            if action == "system_status":
                result = self.get_system_status()
            elif action == "upload_file":
                local_path = input_data.get("local_path")
                remote_path = input_data.get("remote_path")
                if not local_path or not remote_path:
                    raise ValueError("upload_file action requires 'local_path' and 'remote_path'")
                result = self.upload_file(local_path, remote_path)
            else:
                # Execute the command
                command = input_data["command"]
                result = self.execute_command(command)

            return result

        finally:
            # Always disconnect
            self.disconnect()


if __name__ == "__main__":
    run_worker(SSHWorker)
