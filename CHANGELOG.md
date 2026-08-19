# Changelog

All notable changes to this project are documented here.

## [1.16.0] - 2026-08-19

### Added

- Add strictly two-level product categories with parent selection in create/edit flows, child-category navigation, and a parent-level **View all products** action.
- Add administrator-defined display order for categories and products; customer lists apply category order before product order.
- Add a configurable **Hot products** section with editable name/custom icon and product membership.
- Add configurable product combos with name, custom icon, price, component membership, customer purchase flow, and component-labelled delivery.

### Changed

- Calculate combo availability from the least-stocked component and atomically reserve one stock item from every component for each purchased combo.
- Route manual confirmation, AI confirmation, and authenticated SePay fulfillment through the same combo-aware stock allocation rules.

### Security

- Keep combo reservation inside SQLite transactions so concurrent confirmations cannot sell the same component stock twice.

## [1.15.1] - 2026-08-19

### Changed

- Extend guided product creation to three steps: name, price, and numeric Telegram custom emoji ID (or `-` for no icon).
- Validate the emoji ID before inserting the product, so an invalid URL or ID cannot create a partially configured product.

## [1.15.0] - 2026-08-19

### Added

- Add an independent public product description and optional Telegram-hosted product image, editable from the product administration menu without being overwritten by Google Sheet synchronization.
- Add an optional private buyer message to every individual stock item, with bulk `stock || message` input and protected per-stock editing.
- Include each stock item's private message with that exact key/account in automatic, confirmed, AI-confirmed, and manual delivery paths.

### Changed

- Put **Refresh** and context-aware **Back** buttons in one two-column row under both the all-products list and every category product list, including empty lists.

### Security

- Keep stock data and private buyer messages out of AI prompts, previews, public product descriptions, and customer lists; render administrator-authored delivery text with HTML escaping.

## [1.14.9] - 2026-08-19

### Changed

- Place the category grid's **Refresh** and **Back** actions side by side in one final navigation row.

## [1.14.8] - 2026-08-19

### Fixed

- Route slash commands around persistent AI chat mode; `/start` and `/menu` now stop AI mode before restoring normal bot navigation.
- Recognize natural Vietnamese AI-exit text and keep the role-aware reply keyboard available without forcing it over the regular or emoji keyboard.

## [1.14.7] - 2026-08-19

### Changed

- Compact product-list prices into Vietnamese-friendly labels such as `600k`, `1 triệu`, and `1,25 triệu` while retaining exact full-price formatting in orders, payments, and administration.

## [1.14.6] - 2026-08-19

### Changed

- Remove the green availability dot from every in-stock product button so custom product icons remain visually dominant.
- Keep in-stock products on Telegram's neutral default background because Bot API button styles do not accept custom green shades or opacity; out-of-stock products remain red.

## [1.14.5] - 2026-08-19

### Fixed

- Stop forcing the role-aware reply keyboard to reopen whenever Telegram hides the regular keyboard.
- Make the bot menu collapse after each selected action while keeping it available through Telegram's keyboard icon, preventing interference with emoji search.

## [1.14.4] - 2026-08-19

### Changed

- Render in-stock category and product buttons with Telegram's neutral default background plus a compact `🟢` status marker, reducing the solid green area while preserving availability at a glance.
- Keep out-of-stock buttons on the red `danger` style and contact-only products neutral.

## [1.14.3] - 2026-08-19

### Fixed

- Ignore the known `_` and string `reason` metadata fields injected by compatible AI providers before validating tool arguments.
- Preserve strict rejection of every other undeclared tool argument instead of increasing the bounded four-round tool loop.

## [1.14.2] - 2026-08-19

### Fixed

- Retry transient AI provider `408`, `429`, and `5xx` responses up to two times while respecting bounded `Retry-After` delays and the existing total request timeout.
- Keep non-transient authentication and configuration errors fail-fast without exposing provider response bodies.

## [1.14.1] - 2026-08-18

### Fixed

- Reject zero, oversized, and out-of-range custom emoji IDs before rendering a Telegram button, so malformed legacy data falls back to a plain button instead of making Telegram reject the complete keyboard.

## [1.14.0] - 2026-08-18

### Added

- Add separate admin settings for the customer greeting, shop introduction, and support information.
- Persist editable customer-facing content in SQLite and support the safe `{name}`, `{shop}`, and `{support}` placeholders.

### Changed

- Clarify in category/product icon editing that Telegram inline-button icons accept numeric custom emoji IDs, not PNG/SVG URLs.

### Security

- Escape administrator-authored content and placeholder values before sending Telegram HTML messages.

## [1.13.1] - 2026-08-18

### Changed

- Limit the customer category keyboard to two columns per row while preserving custom icons, availability colors, and full-width refresh/back actions.

## [1.13.0] - 2026-08-18

### Changed

- Make category and product name editing a two-step admin flow: enter the new name, then enter a numeric Telegram custom emoji ID or `-` to remove the icon.
- Apply the name and custom emoji together only after the second step validates successfully.
- Style stocked product buttons green and out-of-stock product buttons red; contact-only products without stock remain neutral.

### Fixed

- Use Google Sheet stock when calculating product-button availability inside a category, matching the existing category availability indicator.

## [1.12.0] - 2026-08-18

### Changed

- Display customer product categories in a compact three-column inline-keyboard grid while preserving each category's custom emoji and callback.
- Style a category green when at least one active product has local or Sheet stock, and red when every active product is out of stock.
- Add full-width **Refresh** and **Back** actions below the category grid to match the customer navigation pattern.

## [1.11.0] - 2026-08-18

### Added

- An admin-only **Administration → Settings → Edit information** flow for updating the shop name and Telegram support username without editing deployment files.
- Durable `app_settings` storage whose saved values override the environment defaults after a restart.

### Changed

- Apply shop-information changes immediately to customer welcome/support messages and route the legacy `/setshop` command through the same durable service.

### Security

- Validate shop names and Telegram usernames, escape editable values in HTML messages, and keep bank details and secrets outside this editing flow.

## [1.10.0] - 2026-08-18

### Added

- A dedicated **Admin → Category management** menu with create, rename, hide/show, list, and delete buttons.
- Persistent category visibility state so hidden categories stay available to administrators for later restoration.

### Changed

- Hide inactive categories from the customer category menu while preserving their products and order history.

### Security

- Restrict every category-management callback to `ADMIN_ID`; permanent deletion requires explicit confirmation and is allowed only for empty categories.

## [1.9.1] - 2026-08-18

### Fixed

- Accept the harmless `reason` metadata injected by compatible reasoning providers while preserving strict rejection of every other undeclared tool argument.

## [1.9.0] - 2026-08-18

### Added

- OpenAI-compatible function calling with privacy-filtered read tools for shop, product, stock, order, and audit data.
- A durable `ai_action_requests` confirmation/audit ledger with ten-minute expiry, ownership checks, replay protection, and Confirm/Cancel callbacks.
- Confirmed category/product/stock/order/broadcast/Sheet actions, including protected non-AI handoffs for stock and manual-delivery content.
- Pre-action SQLite snapshots and foreign-key checks for database mutations.

### Changed

- Render bounded AI Markdown emphasis/code safely as Telegram HTML instead of displaying raw `**` markers.
- Upgrade the admin AI from advisory-only responses to grounded reads and explicitly confirmed actions.

### Security

- Keep stock content, customer identity, payment codes, bank details, `.env`, secrets, arbitrary SQL/shell, and deployment outside the AI tool surface.
- Require `ADMIN_ID` at proposal execution time and reject expired, cancelled, cross-admin, or replayed action callbacks.

## [1.8.0] - 2026-08-18

### Added

- Admin-only **Chat with AI** and **Stop AI chat** controls on both reply and inline administration keyboards.
- Persistent SQLite AI chat-mode state so the mode remains active across bot restarts until the admin explicitly stops it.

### Changed

- Route every admin text message to AI while chat mode is active, while retaining the one-shot `/ai` command.
- Remove the redundant customer-section title button and retain only the administration title shown to admins.

### Security

- Keep chat-mode authorization restricted to `ADMIN_ID`; the AI remains stateless, read-only, and without tools, database, shell, configuration, or secret access.

## [1.7.0] - 2026-08-17

### Added

- Admin-only, one-shot AI assistance through `/ai`, with bounded input/output, request timeout, and single-flight protection.
- Admin menu entries, Docker host-gateway support for a host-based OpenAI-compatible provider, and bilingual operation guidance.
- An optional Compose override for private container-to-container AI provider networking.

### Security

- Reject non-admin callers before contacting the AI provider.
- Keep the first AI phase stateless and read-only, without tools, database, shell, configuration, secret, or conversation-history access.

## [1.6.1] - 2026-08-17

### Changed

- Successful order messages now label delivered content as “Thông tin sản phẩm” and render the admin-authored stock text normally instead of as quoted code.
- Replaced the account-specific Outlook guidance with “Liên hệ với lệnh /hotro để được hỗ trợ ngay.”
- Added `/hotro` to the public command menu while retaining `/support` as a compatibility alias.

## [1.6.0] - 2026-08-16

### Added

- Per-product Telegram `custom_emoji_id` storage and button rendering.
- Documented Autodesk production mappings using the supplied custom emoji packs.

### Changed

- Product buttons now put the purchasing facts first: `Price | Stock | App name`.
- Contact-only product buttons use `Price | Contact | App name` while preserving the same column order.

## [1.5.0] - 2026-08-16

### Added

- Per-stock administration from `/viewstock` and the reply-keyboard inventory action: paginated detail views plus edit and delete buttons for each unsold stock record.
- Delete confirmation and immutable protection for stock already linked to completed sales.
- Telegram `icon_custom_emoji_id` support for category buttons and matching custom emoji entities in category headings.

### Changed

- Inventory navigation now starts with a product picker and exposes every stock action through contextual buttons.
- Arbitrary category and stock values are HTML-escaped before being rendered in admin messages.

## [1.4.0] - 2026-08-16

### Added

- A persistent Telegram reply keyboard that users open with the keyboard icon beside the emoji button.
- Separate keyboard sections: customer actions are always shown first; administration actions are appended only for `ADMIN_ID`.
- Text-action routing for every reply-keyboard button, including products, categories, wallet top-ups, orders, stock, statistics, users, broadcast, Sheet sync, and settings.

### Changed

- `/start` and `/menu` now install the role-appropriate reply keyboard instead of requiring users to open an inline menu message.

## [1.3.1] - 2026-08-16

### Fixed

- Initialize Telegram sessions for first-time callback users so guided actions such as add stock, create category/product, broadcast, and custom wallet top-up can store their next-step state.

## [1.3.0] - 2026-08-16

### Added

- Button-first customer navigation for all products, categories, wallet top-up, orders, account information, and support.
- A permission-scoped admin action panel with guided category, product, stock, order, user, broadcast, synchronization, and settings flows.
- Category image URLs with emoji fallback; public PNG/JPG URLs can be shown as category cards.
- Preset wallet top-ups of 10,000đ through 500,000đ plus custom amounts.
- Idempotent SePay wallet reconciliation, automatic balance credit, and persistent customer/admin Telegram notifications.

### Changed

- `/menu` now opens the action menu; legacy commands remain available for compatibility.

## [1.2.1] - 2026-08-16

### Fixed

- Notify the configured Telegram admin exactly once for every authenticated incoming transfer to a configured account, including transfers that do not match an order.
- Include the amount, masked receiving account, gateway, payment code, reference, reconciliation result, and SePay transaction ID in the admin notification.
- Keep order fulfillment separate: only an exact pending-order code and amount match can mark an order paid or deliver stock.

## [1.2.0] - 2026-08-15

### Added

- HMAC-SHA256 SePay endpoint at `POST /webhooks/sepay`, including raw-body verification and a five-minute replay window.
- Exact incoming account, payment-code, and amount matching with unique SePay transaction IDs.
- Persistent SQLite Telegram jobs that retry delivery after transient failures or process restarts.
- Test Mode and Live configuration guidance in Vietnamese and English.

### Changed

- Generate SePay-compatible payment codes using the `PAY` prefix and six alphanumeric characters.
- Reserve stock, mark payment, record the transaction, and enqueue delivery in one immediate SQLite transaction.
- Keep automatically paid orders in `paid` until Telegram delivery succeeds; alert the admin instead of under-delivering when stock is insufficient.

## [1.1.3] - 2026-08-15

### Fixed

- Register the complete admin command menu only for the configured admin chat while keeping the public menu unchanged for customers.

## [1.1.2] - 2026-08-15

### Fixed

- Allow the health endpoint's host bind address to be configured for a reverse proxy running on another machine while retaining loopback as the secure default.

## [1.1.1] - 2026-08-15

### Fixed

- Start health checks and automatic backups after Telegram connects instead of waiting for long polling to stop.
- Exit on fatal polling errors so Docker can restart the bot.

## [1.1.0] - 2026-08-14

### Added

- Production Docker image and hardened Docker Compose runtime.
- Telegram-aware `/healthz` endpoint and container health check.
- Automatic SQLite snapshots with configurable schedule and retention.
- CI checks for syntax, unit tests, and production image builds.
- Vietnamese and English deployment, recovery, and secret-rotation guidance.

### Changed

- Startup now fails fast when required Telegram admin or bank settings are missing.
- Startup logs no longer print the receiving bank-account number.
