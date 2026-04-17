#!/bin/bash
# Use `restart` not `start` — `systemctl start` on an already-running service
# is a no-op. If systemd auto-restarts after stop.sh (Restart=always), `start`
# never actually cycles the process and new deployed code is not picked up.
# See Apr-18 Follow-up 25.
systemctl restart 2connect-backend
