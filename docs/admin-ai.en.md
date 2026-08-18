# Action-capable admin AI

## v1.9.0 scope

Only the Telegram account matching `ADMIN_ID` can use `/ai` or **Chat with AI** mode. The model receives a fixed tool registry; it never receives arbitrary SQL, shell access, `.env`, tokens, secrets, or deployment access.

Read tools run immediately and return filtered data. Every mutation creates a preview with **Confirm/Cancel** buttons, expires after ten minutes, and changes nothing before confirmation. Requests and outcomes remain in the durable `ai_action_requests` audit log.

Conversation content is not stored. The chat-mode flag remains persistent across restarts.

## Business flow

1. The admin describes a request.
2. The provider selects an allowlisted tool with structured arguments.
3. Read results are returned to the model so its answer is grounded.
4. A write tool creates one preview and audit ID; only one mutation is allowed per request.
5. Confirm/Cancel rechecks `ADMIN_ID`, expiry, ownership, and replay state.
6. SQLite mutations create a `pre-ai-*.db` snapshot and run with transaction/foreign-key checks before the audit entry is completed.
7. Stock content and manual-delivery data move to the bot's protected input flow with AI mode disabled, so those values never reach the provider.

## Allowed capabilities

Immediate reads cover shop statistics, categories, products, stock counts/IDs, privacy-filtered orders, and AI action history.

Confirmed actions cover category and product CRUD with business constraints, unsold-stock deletion, protected stock add/edit handoffs, pending-order cancellation, confirmed order delivery, broadcast, and configured Google Sheet synchronization.

Full bank details, `.env` changes, secrets, stock content, customer identity, arbitrary SQL/shell, and deployment remain forbidden. Shop name/support are environment-backed and read-only to AI; operators must use the normal configuration/deployment workflow to change them.

## Examples

```text
Which Autodesk products are out of stock?
Change product #9 price to 650000
Disable product #10
Open protected stock input for product #9
Cancel order #123
Broadcast “Maintenance starts at 22:00”
```

Reads return immediately. Mutations only run after the admin presses **Confirm**.

## Provider configuration

```dotenv
AI_ENABLED=true
AI_BASE_URL=http://host.docker.internal:7317/v1
AI_API_KEY=never_send_in_chat_or_commit
AI_MODEL=provider_model_name
AI_API_MODE=chat_completions
AI_TIMEOUT_MS=45000
AI_MAX_TOKENS=700
```

The provider must support OpenAI-compatible Chat Completions `tools` and `tool_calls`. Keep the key only in the server `.env` with mode `600`. For a provider in another Compose project, use the private-network override documented in `compose.ai-provider.yaml`.

## Recovery notes

- Pending requests expire after ten minutes and cannot be replayed.
- Database snapshots live in the backup volume; follow [the recovery guide](../DEPLOYMENT_EN.md#6-backup-and-restore) for manual restoration.
- External side effects such as delivered broadcasts cannot be recalled by restoring SQLite, so review their previews carefully.
