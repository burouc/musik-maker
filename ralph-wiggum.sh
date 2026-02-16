#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Ralph Wiggum — Run Claude Code in a loop over features.json
# =============================================================================
#
# Reads pending features from features.json one at a time, invokes the claude
# CLI with --output-format stream-json to implement each one, logs everything
# to logs/<feature-id>/, marks the feature done, and commits.
#
# Usage:
#   ./ralph-wiggum.sh                          # Implement next pending P0 feature
#   ./ralph-wiggum.sh --all                    # Loop through ALL pending features
#   ./ralph-wiggum.sh --priority P1            # Only P1 features
#   ./ralph-wiggum.sh --category piano-roll    # Only features in a category (by id)
#   ./ralph-wiggum.sh --limit 5               # Implement at most 5 features
#   ./ralph-wiggum.sh --dry-run               # Show queue without running Claude
#   ./ralph-wiggum.sh --resume cr-01          # Resume a failed feature by id
#   ./ralph-wiggum.sh --max-turns 30          # Override default max turns per feature
#   ./ralph-wiggum.sh --budget 2.00           # Max USD spend per feature
#
# Requirements:
#   - claude CLI on PATH
#   - jq on PATH
#   - features.json in project root
# =============================================================================

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FEATURES_FILE="$ROOT_DIR/features.json"
FEATURES_MD="$ROOT_DIR/FEATURES.md"
LOG_DIR="$ROOT_DIR/logs"
SUMMARY_LOG="$LOG_DIR/run-summary.log"

# Defaults
PRIORITY=""
DRY_RUN=false
LIMIT=1
CATEGORY=""
RESUME_ID=""
MAX_TURNS=50
MAX_BUDGET=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[ralph-wiggum]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ralph-wiggum]${NC} $*"; }
error() { echo -e "${RED}[ralph-wiggum]${NC} $*" >&2; }
info()  { echo -e "${CYAN}[ralph-wiggum]${NC} $*"; }
dim()   { echo -e "${DIM}$*${NC}"; }

ts() { date '+%Y-%m-%d %H:%M:%S'; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)         LIMIT=9999; shift ;;
    --dry-run)     DRY_RUN=true; shift ;;
    --limit)       LIMIT="$2"; shift 2 ;;
    --priority)    PRIORITY="$2"; shift 2 ;;
    --category)    CATEGORY="$2"; shift 2 ;;
    --resume)      RESUME_ID="$2"; shift 2 ;;
    --max-turns)   MAX_TURNS="$2"; shift 2 ;;
    --budget)      MAX_BUDGET="$2"; shift 2 ;;
    -h|--help)
      cat <<'HELP'
Usage: ./ralph-wiggum.sh [OPTIONS]

Options:
  --all                Loop through all pending features (P0 first)
  --priority P0|P1|P2  Only features of this priority
  --category ID        Only features in this category (e.g. piano-roll, mixer)
  --limit N            Implement at most N features (default: 1)
  --dry-run            Show the queue without running Claude
  --resume ID          Resume a specific feature by its id (e.g. cr-01)
  --max-turns N        Max agentic turns per feature (default: 50)
  --budget USD         Max spend per feature in USD (e.g. 2.00)
  -h, --help           Show this help

Logging:
  All runs are logged to logs/<feature-id>/
  A summary of all runs is appended to logs/run-summary.log

Examples:
  ./ralph-wiggum.sh                          # Next P0 feature
  ./ralph-wiggum.sh --priority P0 --all      # All P0 features
  ./ralph-wiggum.sh --dry-run --all          # Preview the full queue
  ./ralph-wiggum.sh --resume pr-03           # Retry a specific feature
  ./ralph-wiggum.sh --limit 3 --budget 1.50  # 3 features, $1.50 cap each
HELP
      exit 0
      ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
if [[ ! -f "$FEATURES_FILE" ]]; then
  error "features.json not found at $FEATURES_FILE"
  exit 1
fi

for cmd in claude jq; do
  if ! command -v "$cmd" &>/dev/null; then
    error "'$cmd' not found on PATH. Install it first."
    exit 1
  fi
done

mkdir -p "$LOG_DIR"

# ---------------------------------------------------------------------------
# Build the feature queue from features.json
# ---------------------------------------------------------------------------
# jq query: flatten all features, filter by status/priority/category, sort by priority
build_queue() {
  local jq_filter='.categories[] as $cat | $cat.features[] | select(.status == "pending") | {id, priority, title, category_id: $cat.id, category_name: $cat.name}'

  # Apply priority filter
  if [[ -n "$PRIORITY" ]]; then
    jq_filter="$jq_filter | select(.priority == \"$PRIORITY\")"
  fi

  # Apply category filter
  if [[ -n "$CATEGORY" ]]; then
    jq_filter="$jq_filter | select(.category_id == \"$CATEGORY\")"
  fi

  jq -c "[$jq_filter] | sort_by(.priority)" "$FEATURES_FILE"
}

# If resuming, build a single-item queue
if [[ -n "$RESUME_ID" ]]; then
  QUEUE=$(jq -c "[.categories[].features[] | select(.id == \"$RESUME_ID\") | . + {category_id: \"resume\", category_name: \"resumed\"}]" "$FEATURES_FILE")
  if [[ "$(echo "$QUEUE" | jq 'length')" -eq 0 ]]; then
    error "Feature id '$RESUME_ID' not found in features.json"
    exit 1
  fi
  LIMIT=1
else
  QUEUE=$(build_queue)
fi

TOTAL=$(echo "$QUEUE" | jq 'length')

if [[ "$TOTAL" -eq 0 ]]; then
  log "No pending features match your filters. All done!"
  exit 0
fi

log "Found ${BOLD}${TOTAL}${NC} pending feature(s). Will process up to ${BOLD}${LIMIT}${NC}."
echo ""

# ---------------------------------------------------------------------------
# Mark a feature status in features.json
# ---------------------------------------------------------------------------
set_feature_status() {
  local feature_id="$1"
  local new_status="$2"
  local tmp
  tmp=$(mktemp)
  jq --arg id "$feature_id" --arg status "$new_status" \
    '(.categories[].features[] | select(.id == $id)).status = $status' \
    "$FEATURES_FILE" > "$tmp" && mv "$tmp" "$FEATURES_FILE"
}

# Also update the checkbox in FEATURES.md if it exists
sync_features_md() {
  local title="$1"
  if [[ -f "$FEATURES_MD" ]]; then
    local escaped
    escaped=$(printf '%s\n' "$title" | sed 's/[][\\.*^$()+?{}|/]/\\&/g')
    sed -i "s/^- \[ \] \(.*${escaped}\)/- [x] \1/" "$FEATURES_MD" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# Process stream-json output and write structured logs
# ---------------------------------------------------------------------------
process_stream() {
  local log_file="$1"
  local raw_file="$2"

  # Tee to raw log and process for human-readable summary
  tee "$raw_file" | while IFS= read -r line; do
    local msg_type
    msg_type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null) || continue

    case "$msg_type" in
      assistant)
        # Extract text content from assistant messages
        echo "$line" | jq -r '
          .message.content[]? |
          if .type == "text" then "[CLAUDE] " + .text
          elif .type == "tool_use" then "[TOOL] " + .name + "(" + (.input | tostring | .[0:120]) + "...)"
          else empty end
        ' 2>/dev/null >> "$log_file"
        ;;
      result)
        echo "$line" | jq -r '"[RESULT] cost=$" + (.cost_usd // 0 | tostring) + " turns=" + (.num_turns // 0 | tostring) + " session=" + (.session_id // "?")' 2>/dev/null >> "$log_file"
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
implemented=0
failed=0
skipped=0
total_cost=0

{
  echo "========================================"
  echo "Run started: $(ts)"
  echo "Filters: priority=${PRIORITY:-any} category=${CATEGORY:-any} limit=${LIMIT}"
  echo "========================================"
} >> "$SUMMARY_LOG"

for i in $(seq 0 $((TOTAL - 1))); do
  if (( implemented >= LIMIT )); then
    break
  fi

  FEATURE=$(echo "$QUEUE" | jq -c ".[$i]")
  feat_id=$(echo "$FEATURE" | jq -r '.id')
  feat_priority=$(echo "$FEATURE" | jq -r '.priority')
  feat_title=$(echo "$FEATURE" | jq -r '.title')
  feat_cat_id=$(echo "$FEATURE" | jq -r '.category_id')
  feat_cat_name=$(echo "$FEATURE" | jq -r '.category_name')

  # Per-feature log directory
  FEAT_LOG_DIR="$LOG_DIR/$feat_id"
  mkdir -p "$FEAT_LOG_DIR"
  FEAT_LOG="$FEAT_LOG_DIR/run.log"
  FEAT_RAW="$FEAT_LOG_DIR/stream.jsonl"
  FEAT_META="$FEAT_LOG_DIR/meta.json"

  echo -e "${BOLD}────────────────────────────────────────────────────────${NC}"
  info "[$((implemented + 1))/${LIMIT}] ${BOLD}[${feat_priority}]${NC} ${feat_title}"
  info "Category: ${feat_cat_name} (${feat_cat_id})"
  info "Feature ID: ${feat_id}"
  info "Log dir: ${DIM}${FEAT_LOG_DIR}${NC}"
  echo -e "${BOLD}────────────────────────────────────────────────────────${NC}"

  # Write initial metadata
  jq -n \
    --arg id "$feat_id" \
    --arg priority "$feat_priority" \
    --arg title "$feat_title" \
    --arg category "$feat_cat_name" \
    --arg started "$(ts)" \
    --arg status "running" \
    '{id: $id, priority: $priority, title: $title, category: $category, started: $started, status: $status}' \
    > "$FEAT_META"

  if [[ "$DRY_RUN" == "true" ]]; then
    warn "[DRY RUN] Would implement: $feat_title"
    (( implemented++ )) || true
    continue
  fi

  # Mark as in-progress
  set_feature_status "$feat_id" "in_progress"

  # Build the prompt
  PROMPT="You are working on the musik-maker project, an FL Studio clone built with React, TypeScript, Vite, and Express.

Implement the following feature:
  Feature ID: ${feat_id}
  Category: ${feat_cat_name}
  Priority: ${feat_priority}
  Feature: ${feat_title}

Instructions:
1. Read the relevant existing source files before making changes.
2. Implement the feature with clean, production-quality code.
3. Follow the existing code style and patterns in the project.
4. Update types in client/src/types/index.ts if needed.
5. Update the AudioEngine if the feature involves audio.
6. Make sure TypeScript compiles without errors.
7. When done, commit your changes with a clear commit message referencing the feature id (${feat_id}).

Do NOT break existing functionality. Keep changes minimal and focused."

  # Build claude command
  CLAUDE_CMD=(claude -p "$PROMPT" --dangerously-skip-permissions --output-format stream-json --max-turns "$MAX_TURNS" --verbose)
  if [[ -n "$MAX_BUDGET" ]]; then
    CLAUDE_CMD+=(--max-budget-usd "$MAX_BUDGET")
  fi

  # Run Claude, pipe through log processor
  log "Starting Claude (max-turns=$MAX_TURNS${MAX_BUDGET:+, budget=\$$MAX_BUDGET})..."
  echo "[$(ts)] Starting claude for $feat_id" >> "$FEAT_LOG"

  run_start=$(date +%s)

  if "${CLAUDE_CMD[@]}" 2>>"$FEAT_LOG_DIR/stderr.log" | process_stream "$FEAT_LOG" "$FEAT_RAW"; then
    run_end=$(date +%s)
    run_duration=$(( run_end - run_start ))

    # Extract session_id and cost from the last result line in stream
    session_id=$(grep '"type":"result"' "$FEAT_RAW" 2>/dev/null | tail -1 | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")
    cost=$(grep '"type":"result"' "$FEAT_RAW" 2>/dev/null | tail -1 | jq -r '.cost_usd // 0' 2>/dev/null || echo "0")
    turns=$(grep '"type":"result"' "$FEAT_RAW" 2>/dev/null | tail -1 | jq -r '.num_turns // 0' 2>/dev/null || echo "0")

    total_cost=$(echo "$total_cost + $cost" | bc 2>/dev/null || echo "$total_cost")

    # Mark as done
    set_feature_status "$feat_id" "done"
    sync_features_md "$feat_title"

    # Update metadata
    jq -n \
      --arg id "$feat_id" \
      --arg priority "$feat_priority" \
      --arg title "$feat_title" \
      --arg category "$feat_cat_name" \
      --arg started "$(jq -r '.started' "$FEAT_META")" \
      --arg finished "$(ts)" \
      --arg status "done" \
      --arg session_id "$session_id" \
      --arg cost "$cost" \
      --arg turns "$turns" \
      --arg duration "${run_duration}s" \
      '{id: $id, priority: $priority, title: $title, category: $category, started: $started, finished: $finished, status: $status, session_id: $session_id, cost_usd: $cost, turns: ($turns | tonumber), duration: $duration}' \
      > "$FEAT_META"

    log "Done: ${feat_title}"
    info "  session=${session_id}  cost=\$${cost}  turns=${turns}  time=${run_duration}s"

    # Commit features.json + FEATURES.md update
    git add "$FEATURES_FILE" "$FEATURES_MD" 2>/dev/null || true
    git commit -m "feat(${feat_id}): mark done — ${feat_title}" --no-verify 2>/dev/null || true

    # Summary log
    echo "[$(ts)] DONE  $feat_id | $feat_title | \$$cost | ${turns} turns | ${run_duration}s | session=$session_id" >> "$SUMMARY_LOG"

    (( implemented++ )) || true
  else
    run_end=$(date +%s)
    run_duration=$(( run_end - run_start ))

    # Mark as failed (revert to pending so it can be retried)
    set_feature_status "$feat_id" "pending"

    # Update metadata
    jq -n \
      --arg id "$feat_id" \
      --arg title "$feat_title" \
      --arg status "failed" \
      --arg duration "${run_duration}s" \
      '{id: $id, title: $title, status: $status, duration: $duration}' \
      > "$FEAT_META"

    error "FAILED: ${feat_title} (see ${FEAT_LOG_DIR}/)"
    echo "[$(ts)] FAIL  $feat_id | $feat_title | ${run_duration}s" >> "$SUMMARY_LOG"
    (( failed++ )) || true

    # Continue to next feature instead of hard-stopping
    warn "Continuing to next feature..."
  fi

  echo ""
done

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
log "Run complete."
info "  Implemented: ${GREEN}${implemented}${NC}"
if (( failed > 0 )); then
  info "  Failed:      ${RED}${failed}${NC}"
fi
info "  Total cost:  ${BOLD}\$${total_cost}${NC}"

remaining=$(jq '[.categories[].features[] | select(.status == "pending")] | length' "$FEATURES_FILE")
if (( remaining > 0 )); then
  info "  Remaining:   ${remaining} pending feature(s)"
else
  log "  All features implemented!"
fi
info "  Logs:        ${DIM}${LOG_DIR}/${NC}"
info "  Summary:     ${DIM}${SUMMARY_LOG}${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"

{
  echo "Run finished: $(ts)"
  echo "  implemented=$implemented failed=$failed cost=\$$total_cost"
  echo "========================================"
  echo ""
} >> "$SUMMARY_LOG"
