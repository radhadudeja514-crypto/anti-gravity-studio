#!/bin/bash
# Start all required services in background
node server.js &
node media-god.js &
node broadcaster.js &
# Keep container alive
wait