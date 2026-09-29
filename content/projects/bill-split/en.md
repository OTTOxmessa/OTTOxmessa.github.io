## The problem

Dinner with friends: everyone orders different things, some dishes are shared, and there's a 10% service charge plus 7% VAT. Whoever paid ends up on a calculator, then sends their bank number to everyone.

## How to use it

1. Add who came (comma-separate several names)
2. Add each item and tap who shared it — nobody selected means everyone
3. Set service charge / VAT / discount
4. Pick who paid and enter their PromptPay number → everyone gets **a QR with their own amount**
5. "Copy summary" for LINE, or "Share bill link" so friends can check the details themselves

## Getting the maths right

- **Shares always add up to the bill exactly** — everything is in satang (integers) and remainders are handed out with the largest-remainder method, so no stray 0.01
- Thai restaurant order: discount → service charge → VAT on (food + service)
- Discount, service and VAT are split in proportion to what each person ate
- **PromptPay QR built from the EMVCo spec** (TLV + CRC-16) and tested against the widely used `promptpay-qr` library for phone, national ID and e-wallet IDs
- National ID numbers are checksum-validated before a QR is made

## Privacy

Everything runs in the browser. A shared link keeps the bill in the URL's `#` fragment, which is never sent to any server.
