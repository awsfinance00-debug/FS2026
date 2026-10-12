# Ledger — M-Thryve Financial System

This is the single place where the Finance team stores the week's files and gets a summary of them: platform reports, sales and expense sheets, invoices, contracts and statements.

## What it does
- **Upload Center**: drop any number of files (xlsx, csv, pdf, docx, images; up to 5.5 MB each).
  - Every file is fingerprinted with a SHA-256 hash, so re-uploading the same file is caught as a duplicate.
  - Each file is stored in the server vault, tagged with category, team, brand and period, and logged under the person who uploaded it.
  - These TikTok Seller Center exports are recognised and summarised automatically:
    - Analytics › **Product list**: GMV by channel, orders, refunds and the top products.
    - Analytics › **Product card traffic**: daily views, click-through and conversion.
    - Marketing › **Promotions list**: discount spend, promotion ROI and the lowest-ROI promotions.
  - A product list can optionally post its GMV by channel into Sales, which drives brand commission. If Sales already holds rows for that brand and period, the option stays off so nothing is counted twice.
  - A payable invoice can optionally be recorded in Daily Expenses as Unpaid. Clicking "mark paid" on the invoice also marks that expense paid.
  - Workbooks that use the Ledger sheet names (05_SALES, 08_OPEX, …) are imported into the ledger tables, as before.
- **Documents**: search and filter every stored file, download it, edit its details, and see open invoices (overdue, or due within 7 days) and contracts ending soon.
- **Platform Performance**: per-brand KPIs, change against the previous period, GMV by channel, the full product table loaded from the stored file, the traffic trend, promotion ROI, and a history table that grows with each week's upload.
- **Dashboard › Weekly review** (shown above the commission P&L):
  - what was received this week
  - open payables and receivables
  - a "Needs attention" list: overdue invoices, contracts ending, refund rate above 15%, promotion ROI below 2×, and brands with no report uploaded in the last 8 days
  - the latest platform snapshot for each brand
- **Upload History**: "Undo upload" removes exactly the ledger rows that one upload added.
- **Team & Audit**: the owner adds or removes Finance users and resets their passwords. Everyone can see the audit trail (logins, uploads, edits, deletions).

## Deploy (GitHub → Netlify)
1. Push this folder (static pages live in `public/`, server code in `netlify/`) to a GitHub repo. Deploy it from GitHub, not by drag-and-drop: drag-and-drop doesn't install the functions' dependency (`@netlify/blobs`).
2. In Netlify, open **Add new site › Import from Git**, pick the repo and leave the build settings as they are (`netlify.toml` already sets them).
3. Under **Site settings › Environment variables**, set:
   - `APP_PASSWORD`: the owner password. Keep the current value so existing data and sign-ins carry over.
   - `SESSION_SECRET` (recommended): any long random string. Changing it signs everyone out.
   - Optional: `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY` and `GOOGLE_APP_ID` for the Google Drive picker.
4. Deploy. Sign in with a **blank email** and the APP_PASSWORD (owner). Then go to **Team & Audit** and add each Finance user with a temporary password.
5. Once every user has their own login, change `APP_PASSWORD` and redeploy. Browsers that saved the old shared password lose access, and only the owner and named users can get in.

Existing data in the `ledger` Blobs store (key `state`) is kept and loaded unchanged. Files go in the `ledger-files` store and audit events in `ledger-audit`.

## Weekly routine (Finance)
1. Export each brand's TikTok reports for last week: Product list, Product card traffic and Promotions. Keep the brand name at the start of the file name (e.g. `Basic_City_product_list_….xlsx`) so the brand is filled in automatically.
2. Upload them in the Upload Center together with that week's invoices, contracts, statements and expense sheets. Check the category, brand and period on each card, then click **Save**.
3. Read the Dashboard's Weekly review and clear the "Needs attention" items.

## Limits
- 5.5 MB per file (Netlify function payload limit). Compress large PDFs, or split exports by date range.
- PDFs and images are stored and tagged, but their contents are not read. Enter the invoice amount and due date on the upload card.
