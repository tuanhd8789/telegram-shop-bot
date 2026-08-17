# Admin AI assistant

## v1.7.0 scope

Only the Telegram account whose ID matches `ADMIN_ID` may use `/ai <question>`. Other callers are rejected before the provider is contacted.

Each question is independent. The AI receives no conversation history and has no tools, database access, shell, `.env` access, tokens, or permission to restart the bot.

## Configuration

```dotenv
AI_ENABLED=true
AI_BASE_URL=http://host.docker.internal:7317/v1
AI_API_KEY=never_send_in_chat_or_commit
AI_MODEL=provider_model_name
AI_API_MODE=chat_completions
AI_TIMEOUT_MS=45000
AI_MAX_TOKENS=700
```

If the provider does not run on the Docker host, replace `AI_BASE_URL` with the appropriate internal or public HTTPS URL. Keep the API key only in the server `.env` file with mode `600`.

If the provider runs in another Docker Compose project, connect through its internal network instead of exposing the port to the Internet:

```dotenv
AI_BASE_URL=http://provider-container:provider-port/v1
AI_PROVIDER_NETWORK=provider_compose_network
```

```bash
docker compose -f compose.yaml -f compose.ai-provider.yaml config --quiet
docker compose -f compose.yaml -f compose.ai-provider.yaml up -d --build
```

## Current usage

```text
/ai Propose a new shop name and support message
```

The AI only returns a proposal. The admin reviews it and applies it with the existing administration commands.

## Safe self-configuration design for a later phase

The model must never receive direct shell or database access. The bot will expose only a narrow action allowlist such as `set_shop_name`, `set_support_contact`, `set_product_active`, and `set_product_price`.

Every write must follow this flow:

1. AI produces a structured proposal.
2. The backend validates authorization, types, and business limits.
3. The bot shows a preview/diff and an expiring request ID.
4. The admin explicitly confirms; the bot backs up before a transactional write.
5. The bot records an audit event, runs a health check, and automatically rolls back on failure.

Secrets, bot tokens, complete bank details, customer data, arbitrary shell, and arbitrary SQL remain outside the allowlist.

This design follows OpenAI's [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [function calling](https://developers.openai.com/api/docs/guides/function-calling), and [safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices).
