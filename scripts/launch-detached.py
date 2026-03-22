#!/usr/bin/env python3
"""Launch a command as a detached background process with PID tracking.

Used by demo-all.sh to start backend and frontend services in the background.
Writes the child PID to --pid-file and redirects output to --log-file.
After a brief startup delay, checks whether the child exited immediately
and reports failure if so.

Usage:
    python3 launch-detached.py --workdir DIR --pid-file FILE --log-file FILE -- COMMAND...
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Launch a command as a detached session and write its pid.")
    parser.add_argument("--workdir", required=True, help="Working directory for the child process")
    parser.add_argument("--pid-file", required=True, help="File to write the child pid into")
    parser.add_argument("--log-file", required=True, help="File to receive combined stdout/stderr")
    parser.add_argument(
        "--startup-delay",
        type=float,
        default=0.5,
        help="Seconds to wait before checking whether the child exited immediately",
    )
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Command to run after --")
    args = parser.parse_args()
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if not args.command:
        parser.error("a command is required after --")
    return args


def main() -> int:
    args = parse_args()

    workdir = Path(args.workdir)
    pid_file = Path(args.pid_file)
    log_file = Path(args.log_file)

    pid_file.parent.mkdir(parents=True, exist_ok=True)
    log_file.parent.mkdir(parents=True, exist_ok=True)

    with open(os.devnull, "rb", buffering=0) as devnull, log_file.open("ab", buffering=0) as log_handle:
        process = subprocess.Popen(
            args.command,
            cwd=workdir,
            stdin=devnull,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )

        time.sleep(max(0.0, args.startup_delay))
        return_code = process.poll()
        if return_code is not None:
            try:
                pid_file.unlink()
            except FileNotFoundError:
                pass
            print(
                f"Detached launch failed for {' '.join(args.command)} (exit code {return_code}). "
                f"See {log_file}.",
                file=sys.stderr,
            )
            return return_code or 1

        pid_file.write_text(f"{process.pid}\n", encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
