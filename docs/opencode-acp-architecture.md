# OpenCode ACP Support Architecture

## Overview

This document describes architecture of OpenCode ACP support in Happy CLI.

## Components

### 1. ACP Backend Factory
- **File:** `src/agent/acp/opencode.ts`
- **Responsibility:** Creates OpenCode backend using `AcpSdkBackend`
- **Command:** `opencode acp`

### 2. Permission Handler
- **File:** `src/opencode/utils/permissionHandler.ts`
- **Responsibility:** Handles tool permission requests with mobile app integration
- **Permission modes:** default, yolo, safe-yolo, read-only

### 3. Reasoning Processor
- **File:** `src/opencode/utils/reasoningProcessor.ts`
- **Responsibility:** Handles thinking events from ACP, detects `**Title**` format

### 4. Diff Processor
- **File:** `src/opencode/utils/diffProcessor.ts`
- **Responsibility:** Formats ACP diffs for display (oldText/newText)

### 5. Options Parser
- **File:** `src/opencode/utils/optionsParser.ts`
- **Responsibility:** Parses XML-formatted options from responses

### 6. Tool Result Formatter
- **File:** `src/opencode/utils/toolResultFormatter.ts`
- **Responsibility:** Formats tool outputs into human-readable summaries

### 7. Session Persistence
- **File:** `src/opencode/utils/sessionPersistence.ts`
- **Responsibility:** Saves/retrieves session metadata for resumption

### 8. Main Runner
- **File:** `src/opencode/runOpenCode.ts`
- **Responsibility:** Main entry point for opencode command

### 9. Display Component
- **File:** `src/ui/ink/OpenCodeDisplay.ts`
- **Responsibility:** Ink UI component for terminal display

## Data Flow

```
User Input → CLI → runOpenCode → ACP Backend → opencode acp
                                                    ↓
                                            session/update notifications
                                                    ↓
                                            Message Queue → Processors → UI + Server
```

## ACP Protocol Support

### Implemented Features
- ✅ Session lifecycle (create, load, resume)
- ✅ Tool permissions (request/response)
- ✅ MCP servers (stdio transport)
- ✅ Session modes (ask/architect/code)
- ✅ Thinking events
- ✅ Diff display
- ✅ Plans (if emitted)
- ✅ Slash commands

### Mobile Integration

Messages are sent via `apiSession.sendAgentMessage('opencode', payload)` using Codex format for compatibility.

## Authentication

OpenCode uses `~/.config/opencode/config.json` for authentication and model configuration. Happy can optionally store credentials via `happy connect opencode`.

## Session Persistence

Sessions are stored in `~/.happy-dev/opencode/sessions/` indexed by working directory hash.
