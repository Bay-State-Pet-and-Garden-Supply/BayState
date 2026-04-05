# EVENTS MODULE

**Scope:** Event-driven architecture for real-time monitoring and communication

## STRUCTURE
```
events/
├── emitter.py             # EventEmitter - central event bus
├── websocket_server.py    # WebSocket server for real-time streaming
├── handlers/              # Event handlers (console, extraction, login, selector)
├── base.py                # Base event classes
├── extraction.py          # Extraction event definitions
├── login.py               # Login event definitions
└── selector.py            # Selector event definitions
```

## EVENT EMITTER

Central event bus with WebSocket support:
```python
from scrapers.events.emitter import EventEmitter

emitter = EventEmitter()
emitter.on("extraction.complete", handler)
emitter.emit("extraction.complete", data)
```

Features: subscribe with `on()`, emit with `emit()`, async handlers, WebSocket broadcast, persistence.

## EVENT TYPES

**Extraction:** `extraction.start`, `extraction.complete`, `extraction.error`, `extraction.field_found`
**Login:** `login.start`, `login.success`, `login.failed`, `login.captcha_detected`
**Selector:** `selector.attempt`, `selector.found`, `selector.not_found`, `selector.timeout`
**Workflow:** `workflow.start`, `workflow.step`, `workflow.complete`, `workflow.error`

## WEBSOCKET SERVER

Real-time event streaming via WebSocket: `WebSocketServer(port=8765)`
Use cases: live monitoring, real-time debugging, external tools, dashboards.

## USAGE IN ACTIONS

```python
if self.ctx.event_emitter:
    self.ctx.event_emitter.emit("my_action.start", {"action": "my_action"})
```

## CONVENTIONS
- Check `event_emitter` exists before emitting
- Structured data with consistent keys
- Use dot notation (e.g., `category.action`)
- Handlers can be async

## ANTI-PATTERNS
- **NO** emitting without checking emitter exists
- **NO** blocking operations in event handlers
- **NO** circular event chains
- **NO** sensitive data in events (passwords, keys)
