# ShopSite XML API Implementation Guide

This guide details how to programmatically download Product and Order data from the ShopSite backend using their XML API (`db_xml.cgi`).

**Official Documentation:**
https://help.shopsite.com/help/current/en-US/sc/pro/index.htm?page=/help/current/en-US/sc/pro/orders.download.format.xml-auto.html

## 1. Authentication
Both endpoints use **HTTP Basic Authentication**.
*   **Username:** Your ShopSite merchant username.
*   **Password:** Your ShopSite merchant password.
*   **Transport:** Requests **must** be made over `HTTPS` to receive sensitive data (like payment info).

## 2. Product Download
Downloads the full product database.

*   **Endpoint:** `https://www.baystatepet.com/cgi-baystatepet/bo/db_xml.cgi`
*   **Method:** `GET`

### Query Parameters
| Parameter | Value | Description |
| :--- | :--- | :--- |
| `clientApp` | `1` | Required. Identifies the client application. |
| `dbname` | `products` | Specifies the target database. |
| `version` | `14.0` | XML schema version. |
| *(fieldmap)* | *(omitted)* | Omit this to download **all** columns. |

### Parsing Notes
*   **Root Element:** `<ShopSiteProducts>` (or implicitly `<Products>` in some versions).
*   **Structure:** List of `<Product>` elements.
*   **Nested Fields:** The field `ProductOnPages` is a container containing `<PageLink>` elements with nested `<Name>` tags. You will need to flatten this (e.g., join names with commas) if storing in a flat table.

---

## 3. Order Download
Downloads customer orders.

*   **Endpoint:** `https://www.baystatepet.com/cgi-baystatepet/bo/db_xml.cgi`
*   **Method:** `GET`

### Query Parameters
| Parameter | Value | Description |
| :--- | :--- | :--- |
| `clientApp` | `1` | Required. |
| `dbname` | `orders` | Specifies the target database. |
| `version` | `14.0` | XML schema version. |
| `pay` | `yes` | **Critical.** Required to receive payment/credit card details. Only works over HTTPS. |
| `startdate` | `MM/dd/yyyy` | (Optional) Start of date range. |
| `enddate` | `MM/dd/yyyy` | (Optional) End of date range. |
| `startorder`| `Integer` | (Optional) First order number to fetch. |
| `maxorder` | `Integer` | (Optional) Limit the number of orders returned. |

### Parsing Notes
*   **Root Element:** `<ShopSiteOrders>`
*   **Structure:** `<Order>` elements containing:
    *   `<Billing>` (Address info)
    *   `<Shipping>` (Address info + `<Products>` list)
    *   `<Payment>` (Method, Status, Transaction ID)
    *   `<Totals>` (Subtotal, Tax, Shipping, GrandTotal)

---

## 4. Critical Implementation Logic ("Gotchas")

The raw response from ShopSite is **not** valid XML 1.0. It frequently contains HTML entities (like `&nbsp;`, `&copy;`) and unencoded ampersands that will break standard XML parsers.

You **must** implement a preprocessing step before parsing the XML:

1.  **Fix Unencoded Ampersands:**
    Use Regex to find `&` characters that are *not* part of an entity and replace them with `&amp;`.
    ```regex
    # Python equivalent regex pattern
    re.sub(r"&(?![a-zA-Z0-9#]+;)", "&amp;", raw_content)
    ```

2.  **Replace HTML Entities:**
    Standard XML only supports 5 entities (`lt`, `gt`, `amp`, `apos`, `quot`). ShopSite returns many others (`&nbsp;`, `&uuml;`, `&copy;`, etc.). You must simple-replace these with their numeric equivalents (e.g., `&#160;` for `&nbsp;`) or strip them before passing the string to your XML parser.

3.  **Encoding:**
    Decode the response as `utf-8` with error replacement (`errors="replace"`) to prevent crashing on malformed characters.
