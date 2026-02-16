#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Ralph Wiggum — Run Claude Code in a loop over FEATURES.md
# =============================================================================
#
# Reads unchecked features (- [ ]) from FEATURES.md one at a time,
# asks Claude to implement each one, then marks it as done (- [x]).
#
# Usage:
#   ./ralph-wiggum.sh                  # Implement next unchecked P0 feature
#   ./ralph-wiggum.sh --all            # Loop through ALL unchecked features (P0 first)
#   ./ralph-wiggum.sh --priority P1    # Only P1 features
#   ./ralph-wiggum.sh --dry-run        # Show what would be done without running Claude
#   ./ralph-wiggum.sh --limit 5        # Implement at most 5 features then stop
#   ./ralph-wiggum.sh --category "Piano Roll"  # Only features in a specific category
#
# Requirements:
#   - claude CLI must be installed and on PATH
#   - FEATURES.md must exist in the project root
# =============================================================================

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FEATURES_FILE="$ROOT_DIR/FEATURES.md"

# Defaults
PRIORITY=""
RUN_ALL=false
DRY_RUN=false
LIMIT=1
CATEGORY=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[ralph-wiggum]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ralph-wiggum]${NC} $*"; }
error() { echo -e "${RED}[ralph-wiggum]${NC} $*" >&2; }
info()  { echo -e "${CYAN}[ralph-wiggum]${NC} $*"; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)       RUN_ALL=true; LIMIT=9999; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    --limit)     LIMIT="$2"; shift 2 ;;
    --priority)  PRIORITY="$2"; shift 2 ;;
    --category)  CATEGORY="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./ralph-wiggum.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --all              Loop through all unchecked features"
      echo "  --priority P0|P1|P2  Only features of this priority"
      echo "  --category NAME    Only features under a matching section header"
      echo "  --limit N          Implement at most N features (default: 1)"
      echo "  --dry-run          Show features without running Claude"
      echo "  -h, --help         Show this help"
      exit 0
      ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
if [[ ! -f "$FEATURES_FILE" ]]; then
  error "FEATURES.md not found at $FEATURES_FILE"
  exit 1
fi

if ! command -v claude &>/dev/null; then
  error "claude CLI not found on PATH. Install it first."
  error "See: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

# ---------------------------------------------------------------------------
# Extract unchecked features
# ---------------------------------------------------------------------------
# Each feature line looks like:
#   - [ ] **[P0]** Description of the feature
# We also track which category/section it belongs to.

get_features() {
  local current_category=""

  while IFS= read -r line; do
    # Track category headers (### N. Category Name)
    if [[ "$line" =~ ^###[[:space:]]+[0-9]+\.[[:space:]]+(.*) ]]; then
      current_category="${BASH_REMATCH[1]}"
      continue
    fi

    # Match unchecked feature lines
    if [[ "$line" =~ ^-\ \[\ \]\ \*\*\[P([0-2])\]\*\*\ (.*) ]]; then
      local feat_priority="${BASH_REMATCH[1]}"
      local feat_desc="${BASH_REMATCH[2]}"

      # Filter by priority if specified
      if [[ -n "$PRIORITY" && "P${feat_priority}" != "$PRIORITY" ]]; then
        continue
      fi

      # Filter by category if specified
      if [[ -n "$CATEGORY" && "$current_category" != *"$CATEGORY"* ]]; then
        continue
      fi

      echo "P${feat_priority}|${current_category}|${feat_desc}"
    fi
  done < "$FEATURES_FILE"
}

# Sort by priority (P0 first, then P1, then P2)
mapfile -t FEATURES < <(get_features | sort -t'|' -k1,1)

if [[ ${#FEATURES[@]} -eq 0 ]]; then
  log "No unchecked features found matching your filters. All done!"
  exit 0
fi

log "Found ${BOLD}${#FEATURES[@]}${NC} unchecked feature(s) matching filters."
echo ""

# ---------------------------------------------------------------------------
# Mark a feature as done in FEATURES.md
# ---------------------------------------------------------------------------
mark_done() {
  local description="$1"
  # Escape special regex characters in the description for sed
  local escaped
  escaped=$(printf '%s\n' "$description" | sed 's/[][\\.*^$()+?{}|/]/\\&/g')
  # Replace - [ ] with - [x] for the matching line
  sed -i "s/^- \[ \] \(.*${escaped}\)/- [x] \1/" "$FEATURES_FILE"
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
implemented=0

for entry in "${FEATURES[@]}"; do
  if (( implemented >= LIMIT )); then
    break
  fi

  IFS='|' read -r priority category description <<< "$entry"

  echo -e "${BOLD}────────────────────────────────────────────────────────${NC}"
  info "Feature $((implemented + 1))/${LIMIT}: ${BOLD}[${priority}]${NC} ${description}"
  info "Category: ${category}"
  echo -e "${BOLD}────────────────────────────────────────────────────────${NC}"

  if [[ "$DRY_RUN" == "true" ]]; then
    warn "[DRY RUN] Would implement: $description"
    (( implemented++ ))
    continue
  fi

  # Build the prompt for Claude
  PROMPT="You are working on the musik-maker project, an FL Studio clone built with React, TypeScript, Vite, and Express.

Implement the following feature:
  Category: ${category}
  Priority: ${priority}
  Feature: ${description}

Instructions:
1. Read the relevant existing source files before making changes.
2. Implement the feature with clean, production-quality code.
3. Follow the existing code style and patterns in the project.
4. Update types in client/src/types/index.ts if needed.
5. Update the AudioEngine if the feature involves audio.
6. Make sure TypeScript compiles without errors.
7. When done, commit your changes with a clear commit message.

Do NOT break existing functionality. Keep changes minimal and focused."

  # Run Claude
  log "Starting Claude..."
  if claude --print --dangerously-skip-permissions -p "$PROMPT"; then
    log "Claude finished implementing: ${description}"

    # Mark as done in FEATURES.md
    mark_done "$description"
    log "Marked as done in FEATURES.md"

    # Commit the FEATURES.md checkbox update
    git add "$FEATURES_FILE"
    git commit -m "Mark feature done: ${description}" --no-verify 2>/dev/null || true

    log "Done with feature $((implemented + 1))"
  else
    error "Claude exited with an error on: ${description}"
    error "Stopping. Fix the issue and re-run."
    exit 1
  fi

  (( implemented++ ))
  echo ""
done

echo ""
log "Implemented ${BOLD}${implemented}${NC} feature(s)."

remaining=$(get_features | wc -l)
if (( remaining > 0 )); then
  info "${remaining} unchecked feature(s) remaining."
else
  log "All features are implemented!"
fi
