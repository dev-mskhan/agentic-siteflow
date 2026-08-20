#!/bin/sh
set -eu

# Minimal test harness for local infrastructure.
# Expects infra to be running (docker compose up -d postgres redis minio).

API_URL="${1:-http://localhost:4000}"

echo "> GET $API_URL/health"
curl -sf "${API_URL}/health" && echo

echo "> GET $API_URL/ready"
curl -sf "${API_URL}/ready" && echo

echo "OK"