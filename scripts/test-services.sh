#!/bin/bash
set -e
BASE_URL="http://18.118.56.229"
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name (got $actual)"
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=1
  fi
}

echo "== Testing Frontend =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
check "Frontend loads" "200" "$STATUS"

echo "== Testing Event Service =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/events")
check "GET /events" "200" "$STATUS"

echo "== Testing Program Service =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/programs")
check "GET /programs" "200" "$STATUS"

echo "== Testing Registration Service =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/registrations")
check "GET /registrations" "200" "$STATUS"

echo "== Testing Registration POST =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/registrations" \
  -H "Content-Type: application/json" \
  -d '{"event_id":1,"name":"Automated Test","email":"test@automation.com","ticket_count":1}')
check "POST /registrations" "201" "$STATUS"

echo "== Testing Analytics Service =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/analytics" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"automated_test","event_id":"ci-test","session_id":"ci-session","metadata":{}}')
check "POST /analytics" "201" "$STATUS"

echo "== Testing Grafana =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/grafana")
check "Grafana loads" "200" "$STATUS"

if [ "$FAIL" -eq 1 ]; then
  echo "One or more tests FAILED"
  exit 1
else
  echo "All tests PASSED"
fi
