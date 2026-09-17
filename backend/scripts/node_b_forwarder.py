#!/usr/bin/env python3
"""
ORBIT — Node B serial forwarder (Laptop B on demo day).

Reads Node B's serial port and forwards each JSON frame line over TCP to
Laptop A (Aditya's machine running the full pipeline).

Usage:
    python node_b_forwarder.py --port COM3 --host 192.168.x.x
    python node_b_forwarder.py --port /dev/ttyUSB0 --host 192.168.x.x --dest-port 9001

On Windows: check Device Manager for the COM port after plugging in Node B.
On Linux:   ls /dev/tty* (usually /dev/ttyUSB0 or /dev/ttyACM0)

The script reconnects automatically on both serial and network drops.
Status printed every 10 seconds.
"""

from __future__ import annotations

import argparse
import socket
import sys
import time

try:
    import serial
except ImportError:
    print("ERROR: pyserial not installed. Run: pip install pyserial")
    sys.exit(1)


def run(port: str, host: str, dest_port: int, baud: int) -> None:
    frames_forwarded = 0
    last_status = time.time()

    print(f"[FORWARDER] Node B serial: {port} @ {baud} baud")
    print(f"[FORWARDER] Forwarding to: {host}:{dest_port}")
    print(f"[FORWARDER] Press Ctrl-C to stop.\n")

    while True:
        # --- open serial port ---
        try:
            ser = serial.Serial(port, baud, timeout=1)
            print(f"[FORWARDER] Serial port {port} opened.")
        except serial.SerialException as e:
            print(f"[FORWARDER] Serial error: {e} — retrying in 3s")
            time.sleep(3)
            continue

        # --- connect to Laptop A ---
        sock = None
        try:
            while True:
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.connect((host, dest_port))
                    print(f"[FORWARDER] Connected to {host}:{dest_port}")
                    break
                except (ConnectionRefusedError, OSError) as e:
                    print(f"[FORWARDER] Cannot connect to {host}:{dest_port}: {e} — retrying in 3s")
                    time.sleep(3)

            # --- forward loop ---
            while True:
                try:
                    line = ser.readline()
                    if not line:
                        continue
                    line = line.strip()
                    if not line:
                        continue
                    sock.sendall(line + b"\n")
                    frames_forwarded += 1

                    now = time.time()
                    if now - last_status >= 10.0:
                        last_status = now
                        print(f"[FORWARDER] Frames forwarded: {frames_forwarded}  Status: Connected")

                except serial.SerialException as e:
                    print(f"[FORWARDER] Serial disconnected: {e} — reconnecting")
                    break
                except (BrokenPipeError, ConnectionResetError, OSError) as e:
                    print(f"[FORWARDER] Network connection lost: {e} — reconnecting")
                    break

        except KeyboardInterrupt:
            print("\n[FORWARDER] Stopped.")
            return
        finally:
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass
            try:
                ser.close()
            except Exception:
                pass
            time.sleep(1)


def main() -> None:
    p = argparse.ArgumentParser(description="ORBIT Node B serial forwarder")
    p.add_argument("--port", required=True, help="Serial port (COM3, /dev/ttyUSB0, etc.)")
    p.add_argument("--host", required=True, help="Laptop A IP address")
    p.add_argument("--dest-port", type=int, default=9001, help="TCP port on Laptop A (default 9001)")
    p.add_argument("--baud", type=int, default=115200, help="Serial baud rate (default 115200)")
    args = p.parse_args()

    run(args.port, args.host, args.dest_port, args.baud)


if __name__ == "__main__":
    main()
