# Claude API — Prompt Caching

Docs: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

## How It Works

Cache KV representations of prompt prefixes. On cache hit, skip reprocessing — 90% cheaper and faster.

- **5-min TTL** (default): 1.25x base input price to write, 0.1x to read
- **1-hour TTL** (opt-in): 2x base input price to write, 0.1x to read
- Caches are org-isolated, exact-match only

## Pricing (per MTok)

| Model | Base Input | Cache Write (5m) | Cache Write (1h) | Cache Read | Output |
|-------|-----------|-----------------|-----------------|-----------|--------|
| Opus 4.6 | $5 | $6.25 | $10 | $0.50 | $25 |
| Sonnet 4.6 | $3 | $3.75 | $6 | $0.30 | $15 |
| Haiku 4.5 | $1 | $1.25 | $2 | $0.10 | $5 |

## Min Cacheable Length

- **4096 tokens**: Opus 4.6/4.5, Haiku 4.5
- **2048 tokens**: Sonnet 4.6, Haiku 3.5/3
- **1024 tokens**: Sonnet 4.5/4.1/4, Opus 4.1/4

## Implementation

### Automatic (recommended for multi-turn)

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    cache_control={"type": "ephemeral"},  # top-level
    system="Your system prompt here...",
    messages=[...],
)
```

Auto-places breakpoint on last cacheable block. Cache moves forward as conversation grows.

### Explicit breakpoints (fine-grained)

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {"type": "text", "text": "System instructions..."},
        {"type": "text", "text": "Large context doc...", "cache_control": {"type": "ephemeral"}},
    ],
    messages=[...],
)
```

Up to 4 breakpoints per request. Place on last block of stable content.

### 1-hour TTL

```python
cache_control={"type": "ephemeral", "ttl": "1h"}
```

When mixing TTLs, longer TTL entries must come before shorter ones.

## Best Practices

1. **Stable content first** — system prompt, tools, context docs at the top
2. **Changing content last** — per-request context, timestamps at the end
3. **Place breakpoints on the last identical block** — not on content that changes every request
4. **Monitor hit rates** — check `cache_read_input_tokens` vs `cache_creation_input_tokens` in response
5. **Wait for first response** before parallel requests (cache needs time to write)

## Tracking

```python
response.usage.cache_creation_input_tokens  # written to cache
response.usage.cache_read_input_tokens      # read from cache
response.usage.input_tokens                 # uncached (after last breakpoint)
```

## What Invalidates Cache

- Changing tool definitions invalidates everything
- Changing tool_choice/thinking params invalidates system + messages cache
- Adding/removing images invalidates system + messages cache
- Content must be 100% identical for a hit
