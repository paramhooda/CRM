# Where BU, category and OEM belong

**Short answer:** classify **every line**, starting from the first conversation. Do not classify only the deal. The deal header shows a *derived* primary BU, category and OEM for convenience. The detailed product (SKU) level arrives at the BOQ stage. It is one list of lines that gets more precise over time, not two separate structures.

## Why line level is the industry norm for SIs and MSPs

Salesforce (Opportunity Products), Dynamics 365 (Opportunity Products), HubSpot (Line items) and the PSA/CRM tools used by MSPs (ConnectWise, Autotask) all model it the same way. The deal is the **buying decision**: one customer, one owner, one stage, one close date, one expected PO. What is being sold is a **list of lines**, each with its own classification and value.

For a systems integrator this matters more than for most businesses, because almost every deal is multi-vendor and multi-practice. A "Data centre refresh" is Dell servers, VMware licences, Cisco switches and your own implementation and AMC services:
- **OEM on the deal** forces you to pick one vendor. Dell then gets credit for the VMware and Cisco value. OEM pipeline for vendor QBRs, deal registration, rebates and MDF claims, and certification targets is wrong on every mixed deal.
- **BU on the deal** credits the whole value to one practice. Services revenue inside an infrastructure deal disappears from the services pipeline, and practice heads cannot trust their numbers.
- **Revenue type** (one-time or recurring) also differs line by line. Hardware is one-time; managed services and AMC are recurring. TCV and ARR are only right when they are summed from the lines.

## The structure

```
Business unit (your practice)   e.g. IT Infrastructure, Cloud, Services, Security
  └─ Category (product family)  e.g. Server, Storage, Networking, FMS, NOC
       └─ Product / SKU         e.g. DELL-SRV-02 "PowerEdge R760"  ── OEM: Dell
OEM is a separate dimension (the vendor) carried on each product and line, not a level in the hierarchy.
```

BU and category are **your** taxonomy for how you organise practices, targets and P&L. OEM is the **vendor** dimension. Keeping them independent lets you ask both "how is Networking doing?" and "how much Cisco is in the pipeline?" without double counting.

| Level | Holds | Set by |
|---|---|---|
| **Deal header** | Account, owner, stage, forecast, close date, procurement mode, deal registration. Value, ARR, margin and the *primary* BU, category and OEM are **derived** from the lines (the largest line), never typed. | Sales |
| **Estimate line** (qualification onward) | BU, category, OEM (may be **To be decided**), estimated value, one-time or recurring. One per practice or vendor in the deal is enough. | Sales |
| **BOQ line** (BOQ stage onward) | Catalogue product (which fixes BU, category, OEM, HSN/SAC, GST) or a classified custom line, quantity, term, cost from purchase, sell price. These replace the estimates. | Presales, purchase (cost), sales (price) |
| **Quote** | An immutable snapshot of the priced BOQ lines, versioned. | Sales |
| **Won lines** | The same BOQ lines, locked and marked ready to bill. | Automatic |

## So, should line level start only at the BOQ?

No. Start at **line level from the first estimate**, but keep it light:
- **Qualification:** sales adds one quick-estimate line per practice or vendor. That takes 30 seconds, and the forecast by BU and OEM is right from day one. If the vendor is not chosen yet, use **OEM: To be decided**. It reports as its own bucket, so you can see how much pipeline is still vendor-open.
- **BOQ:** presales replaces estimates with catalogue lines. "To be decided" is not allowed on BOQ lines, so an OEM must be chosen before pricing and quoting.
- **Quote and won:** only real, priced lines can be quoted or billed.

Waiting until the BOQ to add lines leaves the early pipeline (often 60–70% of it by value) classified only at deal level. That is exactly where forecasting by practice and vendor matters most.

## Reporting rules this gives you

- **Filter by OEM, BU or category** to include a deal if any line matches, counting **only the matching lines' value**. A ₹1 Cr deal with ₹40 L of Dell counts as ₹40 L under Dell, and the remaining ₹60 L shows under its own vendors.
- **Deal counts** stay per deal. Win rates and stage conversion are measured on deals, not lines.
- **Quota credit** goes to the deal owner on the deal value. Practice or BU targets use the line split.

## Possible later refinements (not needed now)

- **Deal registration per OEM.** Registration is currently one set of fields on the deal. If several vendors' registrations on one deal become common, move it to a small child table (OEM, number, status, expiry).
- **Revenue schedules.** Recurring lines already carry frequency and term. Monthly revenue recognition can be generated from them when finance needs it.
