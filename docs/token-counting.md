# Claude API — Token Counting

Docs: https://platform.claude.com/docs/en/build-with-claude/token-counting

## Overview

Free endpoint to count input tokens before sending a request. Helps manage costs and rate limits.

**Endpoint:** `POST https://api.anthropic.com/v1/messages/count_tokens`

Accepts the same payload as Messages API (system, messages, tools, images, PDFs, thinking).

## Usage (Python)

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.count_tokens(
    model="claude-sonnet-4-6",
    system="You are a helpful assistant.",
    messages=[{"role": "user", "content": "Hello, Claude"}],
)

print(response.input_tokens)  # e.g. 14
```

With tools:

```python
response = client.messages.count_tokens(
    model="claude-sonnet-4-6",
    tools=[{
        "name": "get_weather",
        "description": "Get weather for a location",
        "input_schema": {
            "type": "object",
            "properties": {"location": {"type": "string"}},
            "required": ["location"],
        },
    }],
    messages=[{"role": "user", "content": "What's the weather?"}],
)
```

## Key Details

- **Free to use** — only subject to RPM limits (100–8000 depending on tier)
- **Separate rate limits** from message creation
- Returns `{ "input_tokens": N }`
- Token count is an **estimate** — actual may differ slightly
- Supports: text, images, PDFs, tools, extended thinking
- Does NOT use prompt caching (even if `cache_control` blocks are present)
- Thinking blocks from previous assistant turns are ignored (don't count as input)

## Rate Limits

| Tier | RPM |
|------|-----|
| 1 | 100 |
| 2 | 2,000 |
| 3 | 4,000 |
| 4 | 8,000 |
