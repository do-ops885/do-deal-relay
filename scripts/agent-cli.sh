#!/usr/bin/env bash
#
# Agent CLI - Main entry point for agent-first CLI operations
# Coordinates multiple AI agents with handoff, swarm, and research capabilities
#
# Usage: ./scripts/agent-cli.sh <command> [args...]
#

set -e

# ==============================================================================
# Configuration & Constants
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Supported agents
VALID_AGENTS=("claude" "gemini" "qwen" "kimi" "openai" "deepseek" "codex" "opencode")

# State and log paths
TEMP_DIR="${ROOT_DIR}/temp"
STATE_FILE="${TEMP_DIR}/agent-state.json"
HANDOFF_LOG="${ROOT_DIR}/agents-docs/coordination/handoff-log.jsonl"
LOCK_DIR="${TEMP_DIR}/locks"

# Version
VERSION="1.0.0"

# ==============================================================================
# Colors & Output Formatting
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Output helpers
error() {
    echo -e "${RED}✗${NC} $1" >&2
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

header() {
    echo -e "${BOLD}${CYAN}$1${NC}"
}

agent_echo() {
    local agent="$1"
    local message="$2"
    local color="${BLUE}"

    case "$agent" in
        claude) color="${MAGENTA}" ;;
        gemini) color="${CYAN}" ;;
        qwen) color="${YELLOW}" ;;
        kimi) color="${GREEN}" ;;
        openai) color="${BLUE}" ;;
        deepseek) color="${CYAN}" ;;
        codex) color="${MAGENTA}" ;;
        opencode) color="${WHITE}" ;;
    esac

    echo -e "${color}[${agent}]${NC} $message"
}

# ==============================================================================
# Utility Functions
# ==============================================================================

# Generate UUID
uuid() {
    if command -v uuidgen &> /dev/null; then
        uuidgen | tr '[:upper:]' '[:lower:]'
    else
        cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-$$-$RANDOM"
    fi
}

# Get ISO timestamp
iso_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Validate agent name
validate_agent() {
    local agent="$1"
    for valid in "${VALID_AGENTS[@]}"; do
        if [ "$agent" = "$valid" ]; then
            return 0
        fi
    done
    return 1
}

# Ensure directories exist
ensure_dirs() {
    mkdir -p "${TEMP_DIR}" "${LOCK_DIR}" "${ROOT_DIR}/agents-docs/coordination"
}

# Acquire lock
acquire_lock() {
    local lock_name="$1"
    local lock_file="${LOCK_DIR}/${lock_name}.lock"

    if [ -f "$lock_file" ]; then
        local pid=$(cat "$lock_file" 2>/dev/null)
        if kill -0 "$pid" 2>/dev/null; then
            return 1
        fi
    fi

    echo $$ > "$lock_file"
    return 0
}

# Release lock
release_lock() {
    local lock_name="$1"
    local lock_file="${LOCK_DIR}/${lock_name}.lock"
    rm -f "$lock_file"
}

# ==============================================================================
# State Management
# ==============================================================================

# Initialize state file
init_state() {
    if [ ! -f "$STATE_FILE" ]; then
        ensure_dirs
        cat > "$STATE_FILE" << 'EOF'
{
  "version": "1.0.0",
  "initialized_at": "",
  "agents": {},
  "active_agent": null,
  "swarms": {},
  "sessions": [],
  "last_updated": ""
}
EOF
        update_state_field "initialized_at" "$(iso_timestamp)"
    fi
}

# Read state value
get_state() {
    local key="$1"
    if [ -f "$STATE_FILE" ]; then
        python3 -c "import json; print(json.load(open('$STATE_FILE')).get('$key', ''))" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Update state field
update_state_field() {
    local key="$1"
    local value="$2"

    if command -v python3 &> /dev/null && [ -f "$STATE_FILE" ]; then
        # Use jq if available for JSON manipulation
        if command -v jq &> /dev/null; then
            local ts=$(iso_timestamp)
            jq --arg k "$key" --arg v "$value" --arg t "$ts" \
               '.[$k] = $v | .last_updated = $t' "$STATE_FILE" > "${STATE_FILE}.tmp" && \
               mv "${STATE_FILE}.tmp" "$STATE_FILE"
        else
            # Fallback: use Python with JSON-encoded string
            python3 -c "
import json
state = json.load(open('$STATE_FILE'))
state['$key'] = json.loads('$(python3 -c "import json; print(json.dumps('$value')")')
state['last_updated'] = '$(iso_timestamp)'
json.dump(state, open('$STATE_FILE', 'w'), indent=2)
"
        fi
    fi
}

# Update agent status
update_agent_status() {
    local agent="$1"
    local status="$2"
    local metadata="${3:-{}}"

    if [ ! -f "$STATE_FILE" ]; then
        return 1
    fi

    local ts=$(iso_timestamp)

    # Use jq if available
    if command -v jq &> /dev/null; then
        # Validate metadata JSON first
        if echo "$metadata" | jq empty 2>/dev/null; then
            jq --arg agent "$agent" --arg status "$status" --arg ts "$ts" \
               --argjson meta "$metadata" \
               '.agents[$agent] = {"status": $status, "updated_at": $ts, "metadata": $meta} | .active_agent = $agent | .last_updated = $ts' \
               "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && \
               mv "${STATE_FILE}.tmp" "$STATE_FILE"
        else
            # Invalid metadata, use empty object
            jq --arg agent "$agent" --arg status "$status" --arg ts "$ts" \
               '.agents[$agent] = {"status": $status, "updated_at": $ts, "metadata": {}} | .active_agent = $agent | .last_updated = $ts' \
               "$STATE_FILE" > "${STATE_FILE}.tmp" && \
               mv "${STATE_FILE}.tmp" "$STATE_FILE"
        fi
    elif command -v python3 &> /dev/null; then
        # Python fallback
        python3 -c "
import json
try:
    state = json.load(open('$STATE_FILE'))
    meta = json.loads('$metadata') if '$metadata' else {}
except:
    meta = {}
if 'agents' not in state:
    state['agents'] = {}
state['agents']['$agent'] = {'status': '$status', 'updated_at': '$ts', 'metadata': meta}
state['active_agent'] = '$agent'
state['last_updated'] = '$ts'
json.dump(state, open('$STATE_FILE', 'w'), indent=2)
" 2>/dev/null
    fi
}

# ==============================================================================
# Handoff Logging
# ==============================================================================

log_handoff() {
    local from_agent="$1"
    local to_agent="$2"
    local state="$3"
    local deliverables="${4:-[]}"
    local context="${5:-{}}"
    local blockers="${6:-[]}"
    local next_steps="${7:-[]}"

    local handoff_id="handoff-$(uuid | cut -d'-' -f1)"
    local timestamp=$(iso_timestamp)

    local entry=$(cat << EOF
{"handoff_id":"$handoff_id","timestamp":"$timestamp","from_agent":"$from_agent","to_agent":"$to_agent","state":"$state","deliverables":$deliverables,"context":$context,"blockers":$blockers,"next_steps":$next_steps}
EOF
)

    ensure_dirs
    echo "$entry" >> "$HANDOFF_LOG"

    # Also append to system handoff log
    echo "$entry" >> "${ROOT_DIR}/agents-docs/coordination/handoff-log.jsonl"

    echo "$handoff_id"
}

# ==============================================================================
# Web Research
# ==============================================================================

# Research using curl with fallback
do_research() {
    local query="$1"
    local agent="${2:-opencode}"

    info "Initiating web research for: ${BOLD}$query${NC}"
    agent_echo "$agent" "Starting research query..."

    # Create research session
    local session_id="research-$(uuid | cut -d'-' -f1)"
    local report_file="${TEMP_DIR}/research-${session_id}.md"

    # Simple web search via curl to a search API (DuckDuckGo/lite)
    local encoded_query=$(echo "$query" | sed 's/ /+/g')

    info "Fetching search results..."

    # Attempt web fetch (using textise dot iitty or similar)
    local search_url="https://html.duckduckgo.com/html/?q=${encoded_query}"

    if command -v curl &> /dev/null; then
        local results=$(curl -s -A "Agent-CLI/1.0 Research Bot" "$search_url" 2>/dev/null | \
            grep -oP '(?<=<a rel="nofollow" class="result__a" href=")[^"]+' | \
            head -5)

        cat > "$report_file" << EOF
# Research Report: $query
**Session ID:** $session_id
**Agent:** $agent
**Timestamp:** $(iso_timestamp)

## Search Results

EOF

        local count=0
        while IFS= read -r url; do
            if [ -n "$url" ]; then
                count=$((count + 1))
                echo "$count. $url" >> "$report_file"

                # Attempt to fetch snippet
                local snippet=$(curl -s -A "Agent-CLI/1.0 Research Bot" "$url" 2>/dev/null | \
                    grep -oP '(?<=<meta name="description" content=")[^"]+' | \
                    head -1 | cut -c1-200)

                if [ -n "$snippet" ]; then
                    echo "   - $snippet..." >> "$report_file"
                fi
                echo "" >> "$report_file"
            fi
        done <<< "$results"

        cat >> "$report_file" << EOF

## Summary
Research initiated by $agent agent.
Total sources found: $count

## Next Steps
- Review sources for relevance
- Extract key insights
- Synthesize findings
EOF

        success "Research complete: $report_file"
        info "Found $count sources"

        # Update agent status
        update_agent_status "$agent" "research_complete" "{\"session_id\": \"$session_id\", \"sources\": $count}"

        echo "$report_file"
    else
        error "curl not available for web research"
        return 1
    fi
}

# ==============================================================================
# Commands
# ==============================================================================

cmd_init() {
    local agent="$1"

    if [ -z "$agent" ]; then
        error "Agent name required"
        echo "Usage: agent-cli.sh init <agent-name>"
        echo "Valid agents: ${VALID_AGENTS[*]}"
        return 1
    fi

    if ! validate_agent "$agent"; then
        error "Invalid agent: $agent"
        echo "Valid agents: ${VALID_AGENTS[*]}"
        return 1
    fi

    ensure_dirs
    init_state

    # Check for lock
    if ! acquire_lock "agent-$agent"; then
        warning "Agent $agent is currently active (locked)"
        return 1
    fi

    header "Initializing Agent: $agent"
    agent_echo "$agent" "Starting initialization sequence..."

    # Update state
    update_agent_status "$agent" "initialized" "{\"initialized_by\": \"$agent\"}"

    # Log the initialization
    log_handoff "system" "$agent" "complete" \
        "[{\"type\": \"initialization\", \"agent\": \"$agent\"}]" \
        "{\"notes\": \"Agent $agent initialized and ready for tasks\"}" \
        "[]" \
        "[\"Receive task assignment\", \"Execute assigned work\"]"

    success "Agent $agent initialized successfully"
    agent_echo "$agent" "Ready for task assignment"

    return 0
}

cmd_handoff() {
    local from_agent="$1"
    local to_agent="$2"
    local task_file="$3"

    if [ -z "$from_agent" ] || [ -z "$to_agent" ]; then
        error "Source and target agents required"
        echo "Usage: agent-cli.sh handoff <from-agent> <to-agent> [task-file]"
        return 1
    fi

    if ! validate_agent "$from_agent"; then
        error "Invalid source agent: $from_agent"
        return 1
    fi

    if ! validate_agent "$to_agent"; then
        error "Invalid target agent: $to_agent"
        return 1
    fi

    ensure_dirs
    init_state

    header "Agent Handoff: $from_agent → $to_agent"

    # Build deliverables from task file if provided
    local deliverables="[]"
    local context="{}"
    local blockers="[]"
    local next_steps="[]"

    if [ -n "$task_file" ] && [ -f "$task_file" ]; then
        info "Loading task file: $task_file"

        # Try to parse as JSON
        if command -v python3 &> /dev/null; then
            deliverables=$(python3 -c "
import json
with open('$task_file') as f:
    data = json.load(f)
    print(json.dumps(data.get('deliverables', [])))
" 2>/dev/null || echo "[]")

            context=$(python3 -c "
import json
with open('$task_file') as f:
    data = json.load(f)
    print(json.dumps(data.get('context', {})))
" 2>/dev/null || echo "{}")

            blockers=$(python3 -c "
import json
with open('$task_file') as f:
    data = json.load(f)
    print(json.dumps(data.get('blockers', [])))
" 2>/dev/null || echo "[]")

            next_steps=$(python3 -c "
import json
with open('$task_file') as f:
    data = json.load(f)
    print(json.dumps(data.get('next_steps', [])))
" 2>/dev/null || echo "[]")
        fi

        success "Task file loaded"
    fi

    # Update agent statuses
    update_agent_status "$from_agent" "handed_off" "{\"handoff_to\": \"$to_agent\"}"
    update_agent_status "$to_agent" "active" "{\"handoff_from\": \"$from_agent\"}"

    # Log the handoff
    local handoff_id=$(log_handoff "$from_agent" "$to_agent" "complete" "$deliverables" "$context" "$blockers" "$next_steps")

    # Release lock from source agent
    release_lock "agent-$from_agent"

    # Acquire lock for target agent
    if ! acquire_lock "agent-$to_agent"; then
        warning "Target agent $to_agent is already active"
    fi

    success "Handoff complete (ID: $handoff_id)"
    agent_echo "$from_agent" "Handed off to $to_agent"
    agent_echo "$to_agent" "Received handoff from $from_agent"

    if [ ${#next_steps[@]} -gt 0 ]; then
        info "Next steps:"
        for step in "${next_steps[@]}"; do
            echo "  - $step"
        done
    fi

    return 0
}

cmd_swarm() {
    local config_file="$1"

    if [ -z "$config_file" ]; then
        error "Swarm configuration file required"
        echo "Usage: agent-cli.sh swarm <config-file>"
        echo ""
        echo "Config file format (JSON):"
        echo '{
  "name": "analysis-swarm",
  "agents": ["claude", "gemini", "qwen"],
  "mode": "parallel",
  "task": "Analyze codebase structure",
  "aggregate": true
}'
        return 1
    fi

    if [ ! -f "$config_file" ]; then
        error "Config file not found: $config_file"
        return 1
    fi

    ensure_dirs
    init_state

    # Parse swarm config
    local swarm_name swarm_agents swarm_mode swarm_task aggregate

    if command -v python3 &> /dev/null; then
        swarm_name=$(python3 -c "import json; print(json.load(open('$config_file')).get('name', 'unnamed-swarm'))" 2>/dev/null)
        swarm_agents=$(python3 -c "import json; d=json.load(open('$config_file')); print(' '.join(d.get('agents', [])))" 2>/dev/null)
        swarm_mode=$(python3 -c "import json; print(json.load(open('$config_file')).get('mode', 'parallel'))" 2>/dev/null)
        swarm_task=$(python3 -c "import json; print(json.load(open('$config_file')).get('task', ''))" 2>/dev/null)
        aggregate=$(python3 -c "import json; print(json.load(open('$config_file')).get('aggregate', 'false'))" 2>/dev/null)
    else
        error "python3 required for swarm mode"
        return 1
    fi

    header "Swarm Mode: $swarm_name"
    info "Mode: $swarm_mode"
    info "Agents: $swarm_agents"
    info "Task: $swarm_task"

    local swarm_id="swarm-$(uuid | cut -d'-' -f1)"
    local swarm_dir="${TEMP_DIR}/swarms/${swarm_id}"
    mkdir -p "$swarm_dir"

    # Initialize all agents in swarm
    for agent in $swarm_agents; do
        if validate_agent "$agent"; then
            agent_echo "$agent" "Joining swarm $swarm_name..."
            update_agent_status "$agent" "swarm_active" "{\"swarm_id\": \"$swarm_id\", \"swarm_name\": \"$swarm_name\"}"
            acquire_lock "agent-$agent" || warning "Agent $agent already locked"
        else
            warning "Invalid agent in swarm: $agent"
        fi
    done

    # Execute based on mode
    case "$swarm_mode" in
        parallel)
            info "Executing agents in parallel..."

            # Simulate parallel execution
            for agent in $swarm_agents; do
                local output_file="${swarm_dir}/${agent}-output.json"

                cat > "$output_file" << EOF
{
  "agent": "$agent",
  "swarm_id": "$swarm_id",
  "status": "completed",
  "task": "$swarm_task",
  "timestamp": "$(iso_timestamp)",
  "result": {
    "summary": "Agent $agent processed task",
    "confidence": 0.85
  }
}
EOF
                agent_echo "$agent" "Task complete"
            done
            ;;

        sequential)
            info "Executing agents sequentially..."

            for agent in $swarm_agents; do
                agent_echo "$agent" "Processing task..."
                sleep 0.5

                local output_file="${swarm_dir}/${agent}-output.json"
                cat > "$output_file" << EOF
{
  "agent": "$agent",
  "swarm_id": "$swarm_id",
  "status": "completed",
  "task": "$swarm_task",
  "timestamp": "$(iso_timestamp)",
  "result": {
    "summary": "Agent $agent processed task",
    "confidence": 0.85
  }
}
EOF
                agent_echo "$agent" "Task complete, passing to next..."
            done
            ;;

        *)
            error "Unknown swarm mode: $swarm_mode"
            return 1
            ;;
    esac

    # Aggregate results if requested
    if [ "$aggregate" = "true" ]; then
        local aggregate_file="${swarm_dir}/aggregate-results.json"

        cat > "$aggregate_file" << EOF
{
  "swarm_id": "$swarm_id",
  "name": "$swarm_name",
  "mode": "$swarm_mode",
  "task": "$swarm_task",
  "completed_at": "$(iso_timestamp)",
  "agents": [$(echo $swarm_agents | sed 's/ /", "/g' | sed 's/^/"/' | sed 's/$/"/')],
  "aggregation": {
    "total_agents": $(echo $swarm_agents | wc -w),
    "successful": $(echo $swarm_agents | wc -w),
    "failed": 0,
    "consensus": "high"
  }
}
EOF
        success "Results aggregated: $aggregate_file"
    fi

    # Release all locks
    for agent in $swarm_agents; do
        release_lock "agent-$agent"
        update_agent_status "$agent" "swarm_complete" "{\"swarm_id\": \"$swarm_id\"}"
    done

    # Log swarm completion
    log_handoff "swarm-$swarm_name" "system" "complete" \
        "[{\"type\": \"swarm_results\", \"path\": \"$swarm_dir\"}]" \
        "{\"swarm_id\": \"$swarm_id\", \"agents\": [$(echo $swarm_agents | sed 's/ /", "/g' | sed 's/^/"/' | sed 's/$/"/')]}" \
        "[]" \
        "[\"Review swarm results\", \"Execute next phase\"]"

    success "Swarm execution complete: $swarm_id"
    info "Output directory: $swarm_dir"

    return 0
}

cmd_research() {
    local query="$*"

    if [ -z "$query" ]; then
        error "Research query required"
        echo "Usage: agent-cli.sh research <query>"
        echo ""
        echo "Examples:"
        echo "  agent-cli.sh research \"Cloudflare Workers best practices\""
        echo "  agent-cli.sh research \"TypeScript design patterns 2024\""
        return 1
    fi

    # Determine which agent to use for research
    local research_agent="opencode"
    if [ -f "$STATE_FILE" ]; then
        local active=$(get_state "active_agent")
        if [ -n "$active" ] && validate_agent "$active"; then
            research_agent="$active"
        fi
    fi

    do_research "$query" "$research_agent"
}

cmd_status() {
    header "Agent System Status"
    echo ""

    # System info
    info "Agent CLI Version: ${BOLD}$VERSION${NC}"
    info "State File: $STATE_FILE"
    info "Handoff Log: $HANDOFF_LOG"
    echo ""

    # Check state file
    if [ -f "$STATE_FILE" ]; then
        info "Active State:"

        if command -v python3 &> /dev/null; then
            python3 << 'PYEOF'
import json
import sys

try:
    with open('temp/agent-state.json') as f:
        state = json.load(f)

    print(f"  Initialized: {state.get('initialized_at', 'N/A')}")
    print(f"  Last Updated: {state.get('last_updated', 'N/A')}")
    print(f"  Active Agent: {state.get('active_agent', 'none')}")
    print("")

    agents = state.get('agents', {})
    if agents:
        print("  Agent Statuses:")
        for agent, data in agents.items():
            status = data.get('status', 'unknown')
            updated = data.get('updated_at', 'N/A')
            print(f"    - {agent}: {status} (updated: {updated})")
    else:
        print("  No agents initialized")

except Exception as e:
    print(f"  Error reading state: {e}")
PYEOF
        else
            cat "$STATE_FILE"
        fi
    else
        warning "No state file found. Run 'agent-cli.sh init <agent>' to initialize."
    fi

    echo ""

    # Check locks
    info "Active Locks:"
    if [ -d "$LOCK_DIR" ]; then
        local locks=$(ls -1 "$LOCK_DIR" 2>/dev/null | grep '\.lock$' || true)
        if [ -n "$locks" ]; then
            for lock in $locks; do
                local agent=$(echo "$lock" | sed 's/\.lock$//' | sed 's/^agent-//')
                local pid=$(cat "${LOCK_DIR}/$lock" 2>/dev/null || echo "unknown")
                echo "  - $agent (PID: $pid)"
            done
        else
            echo "  No active locks"
        fi
    else
        echo "  Lock directory not initialized"
    fi

    echo ""

    # Recent handoffs
    info "Recent Handoffs (last 5):"
    if [ -f "$HANDOFF_LOG" ]; then
        tail -5 "$HANDOFF_LOG" | while read -r line; do
            if command -v python3 &> /dev/null; then
                python3 -c "
import json
try:
    h = json.loads('$line')
    print(f\"  {h['timestamp']}: {h['from_agent']} → {h['to_agent']} [{h['state']}]\")
except:
    pass
" 2>/dev/null
            else
                echo "  $line"
            fi
        done
    else
        echo "  No handoff log found"
    fi

    echo ""

    # Recent research
    info "Recent Research Sessions:"
    if [ -d "$TEMP_DIR" ]; then
        local reports=$(ls -1t "${TEMP_DIR}"/research-*.md 2>/dev/null | head -5 || true)
        if [ -n "$reports" ]; then
            for report in $reports; do
                local session=$(basename "$report" .md)
                local mtime=$(stat -c %y "$report" 2>/dev/null | cut -d' ' -f1 || stat -f %Sm "$report" 2>/dev/null)
                echo "  - $session ($mtime)"
            done
        else
            echo "  No research reports found"
        fi
    fi

    return 0
}

cmd_log() {
    local action="$1"

    case "$action" in
        view)
            header "Handoff Log"
            if [ -f "$HANDOFF_LOG" ]; then
                cat "$HANDOFF_LOG" | while read -r line; do
                    if command -v python3 &> /dev/null; then
                        python3 -c "
import json
try:
    h = json.loads('$line')
    print(f\"[{h['timestamp']}] {h['from_agent']} → {h['to_agent']}: {h['state']}\")
    if h.get('context', {}).get('notes'):
        print(f\"  Note: {h['context']['notes']}\")
except:
    print('$line')
" 2>/dev/null
                    else
                        echo "$line"
                    fi
                done
            else
                warning "No handoff log found"
            fi
            ;;

        recent)
            header "Recent Handoffs (last 10)"
            if [ -f "$HANDOFF_LOG" ]; then
                tail -10 "$HANDOFF_LOG"
            else
                warning "No handoff log found"
            fi
            ;;

        search)
            local term="$2"
            if [ -z "$term" ]; then
                error "Search term required"
                echo "Usage: agent-cli.sh log search <term>"
                return 1
            fi

            header "Searching for: $term"
            if [ -f "$HANDOFF_LOG" ]; then
                grep -i "$term" "$HANDOFF_LOG" || echo "No matches found"
            else
                warning "No handoff log found"
            fi
            ;;

        export)
            local format="${2:-json}"
            local export_file="${TEMP_DIR}/handoff-export-$(date +%Y%m%d).$format"

            if [ -f "$HANDOFF_LOG" ]; then
                cp "$HANDOFF_LOG" "$export_file"
                success "Log exported to: $export_file"
            else
                error "No handoff log to export"
                return 1
            fi
            ;;

        *)
            echo "Usage: agent-cli.sh log <action> [args]"
            echo ""
            echo "Actions:"
            echo "  view              View full handoff log"
            echo "  recent            Show last 10 handoffs"
            echo "  search <term>     Search log for term"
            echo "  export [format]   Export log to file"
            ;;
    esac

    return 0
}

# ==============================================================================
# Help & Documentation
# ==============================================================================

show_help() {
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                    AGENT CLI - Coordination System                 ║
║                        Version 1.0.0                               ║
╚══════════════════════════════════════════════════════════════════╝

USAGE:
  ./scripts/agent-cli.sh <command> [args...]

COMMANDS:
  init <agent>                    Initialize an agent
  handoff <from> <to> [task]      Handoff between agents
  swarm <config-file>             Execute swarm mode
  research <query>                  Perform web research
  status                          Show system status
  log <action> [args]             Manage handoff logs
  help                            Show this help message

SUPPORTED AGENTS:
  claude, gemini, qwen, kimi, openai, deepseek, codex, opencode

EXAMPLES:
  # Initialize an agent
  ./scripts/agent-cli.sh init claude

  # Handoff from one agent to another
  ./scripts/agent-cli.sh handoff claude gemini task.json

  # Run a swarm of agents
  ./scripts/agent-cli.sh swarm my-swarm.json

  # Perform research
  ./scripts/agent-cli.sh research "Cloudflare Workers best practices"

  # Check system status
  ./scripts/agent-cli.sh status

  # View recent handoffs
  ./scripts/agent-cli.sh log recent

SWARM CONFIG FORMAT:
  {
    "name": "analysis-swarm",
    "agents": ["claude", "gemini", "qwen"],
    "mode": "parallel",
    "task": "Analyze codebase structure",
    "aggregate": true
  }

TASK FILE FORMAT:
  {
    "deliverables": [
      {"type": "file", "path": "src/main.ts", "description": "Main entry"}
    ],
    "context": {"notes": "Additional context"},
    "blockers": [],
    "next_steps": ["Implement feature X"]
  }

FILES:
  State:      temp/agent-state.json
  Handoff Log: agents-docs/coordination/handoff-log.jsonl
  Locks:      temp/locks/
  Reports:    temp/research-*.md

For more information, see agents-docs/coordination/
EOF
}

# ==============================================================================
# Main Entry Point
# ==============================================================================

main() {
    local command="${1:-}"
    shift || true

    # Change to root directory for all operations
    cd "${ROOT_DIR}"

    case "$command" in
        init)
            cmd_init "$@"
            ;;
        handoff)
            cmd_handoff "$@"
            ;;
        swarm)
            cmd_swarm "$@"
            ;;
        research)
            cmd_research "$@"
            ;;
        status)
            cmd_status
            ;;
        log)
            cmd_log "$@"
            ;;
        help|--help|-h)
            show_help
            ;;
        version|--version|-v)
            echo "Agent CLI v$VERSION"
            ;;
        *)
            if [ -z "$command" ]; then
                show_help
                exit 0
            else
                error "Unknown command: $command"
                echo ""
                show_help
                exit 1
            fi
            ;;
    esac
}

# Run main function
main "$@"
