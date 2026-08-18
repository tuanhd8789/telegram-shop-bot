# Product custom emoji icons

Product buttons render their text as `Price | Stock | App name`. When `products.custom_emoji_id` contains a numeric Telegram custom emoji document ID, that icon is attached through `InlineKeyboardButton.icon_custom_emoji_id` without changing the text order.

## Current Autodesk mapping

| Product IDs | Product | Pack | Custom emoji ID | Type |
|---|---|---|---|---|
| 9, 10, 18 | Autodesk Full App, AutoCAD LT, Revit | `AppsIconsWB` | `5916038376150011838` | Static Autodesk logo |
| 14 | 3ds Max | `IconsEmoji_JABA` | `5276081871019591962` | Animated 3D prism |
| 22 | Inventor Pro | `IconsEmoji_JABA` | `5366231924597604153` | Animated gear |
| 26, 27 | Autodesk Admin Panel | `IconsEmoji_JABA` | `5363972600001216334` | Animated shield |

The supplied packs do not contain separate official AutoCAD, Revit, 3ds Max, or Inventor logos. The mapping therefore keeps the exact Autodesk logo where appropriate and uses neutral functional icons instead of assigning another vendor's logo.

## Updating an icon

Store the numeric document ID in `products.custom_emoji_id`. Invalid or empty values are ignored by the renderer, so the product button remains usable without a custom icon. Test every new ID through the bot before applying it to production because Telegram can reject unavailable or unauthorized custom emoji IDs.

Administrators can update either a category or product from its management menu:

1. Select **Edit name & icon** and enter the new name.
2. Enter the numeric custom emoji document ID. Send `-` to remove the custom icon.

The bot validates the ID and saves the name and icon together after step 2. An invalid ID leaves the edit session open and does not partially rename the record.

## Hướng dẫn nhanh

Trong menu quản trị danh mục hoặc sản phẩm, chọn **Sửa tên & icon**:

1. Nhập tên mới.
2. Nhập ID custom emoji chỉ gồm chữ số; gửi `-` nếu muốn bỏ icon.

Tên và icon chỉ được lưu cùng lúc sau khi bước 2 hợp lệ. Nút sản phẩm còn hàng hiển thị màu xanh, hết hàng hiển thị màu đỏ; sản phẩm chỉ liên hệ không bị gán nhầm là hết hàng.
