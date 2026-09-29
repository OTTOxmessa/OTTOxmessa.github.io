## The problem

Freelancers, small agencies and SMEs usually build quotations one by one in Word or Excel. Numbers get duplicated, VAT and withholding tax get miscalculated, nobody remembers who hasn't paid, and the same details are retyped from quotation to invoice to receipt.

## The flow

1. **Quotation** — pick a saved customer or type a new one (saved automatically), add lines from your catalog, and watch a live preview of the document as you type
2. Track status: draft → sent → accepted / declined (and see when a quote has expired)
3. **Convert to an invoice** in one click — lines, terms and customer carry over, referencing the quote number
4. **Record payments**, full or partial; overpaying is refused and a **receipt is issued automatically**
5. Print or save any document as PDF; unpaid invoices carry a **PromptPay QR for the outstanding balance**

## Getting it right

- All money in **satang**, with both VAT-exclusive and VAT-inclusive pricing
- **Withholding tax is computed on the pre-VAT amount** (1% / 2% / 3% / 5%) and the net payable is shown
- Partial-payment receipts are back-calculated so the net **matches the money received to the satang** (tested across many amounts × every tax mode); when rounding can't land exactly, a visible "rounding" line makes up the difference
- Automatic numbering like `INV-202609-001`, per type, restarting monthly, with duplicate checks
- Customer details are **snapshotted** into each document, so editing a customer later never changes old paperwork
- 13-digit tax IDs are checksum-validated
- Issued documents can be voided but not deleted (the number stays, the amount is excluded), the way accountants expect

## Reports

Monthly invoiced / collected / output VAT, a 6-month chart, **receivables aging** (current, 1–30, 31–60, 61–90, 90+ days), a follow-up list, quotes awaiting reply, win rate, top customers, per-customer statements and a CSV export for your accountant.

## Data

Stored in this browser, no server — back up and restore as a file. This tool prepares documents; it isn't tax advice.
