# Sales → Presales → Purchase → Quote workflow

This is how a deal moves from a sales conversation to a priced quote, including every revision. The CRM derives one **workflow state** per deal from the requests and quotes on it. Users never set it by hand, so it cannot drift.

The rules live in `src/lib/workflow.ts` (pure and unit-tested). The actions live in `src/server/actions/workflow.ts`, and reminders in `src/lib/workflow-automation.ts`.

## States

| State | Meaning | Waiting on |
|---|---|---|
| Estimate only | Only quick-estimate lines; presales not engaged yet | Sales |
| With presales | A BOQ request (or revision) is open | Presales engineer |
| Waiting on sales | Presales asked sales a question; the request is paused | Sales |
| Needs pricing | BOQ lines exist without a current cost and no pricing request is open | Sales (request pricing) |
| With purchase | A pricing request is open | Purchase |
| Ready to quote | Every BOQ line has a current cost; sales sets prices and issues the quote | Sales |
| Quote with customer | The latest quote was sent and nothing changed since | Customer |
| Customer wants changes | The customer asked for changes to the latest quote | Sales |
| Quote accepted | The customer accepted; waiting for the PO | – |
| Closed | Won, Lost or Dropped | – |

Precedence, from highest to lowest:
1. Closed stage.
2. An open presales request.
3. An open pricing request.
4. The latest quote, which counts only if it is newer than the last BOQ submission or pricing.
5. Otherwise, the line items decide the state.

## Happy path

1. **Sales: Pull in presales.** Sales picks the engineer, due date (7-day SLA) and scope, and can move the deal to the BOQ stage.
2. **Presales: build the BOQ, then Submit BOQ.**
   - Every estimate line must be replaced by catalogue or custom lines, and every line needs a real OEM (not "To be decided").
   - Only lines **without a current cost** go to purchase. On the first BOQ that is every line.
   - The pricing request keeps the previous buyer, or goes to the least-loaded one.
3. **Purchase: enter costs, then Pricing complete.**
   - Every BOQ line needs a cost. Purchase sets a validity date for the supplier pricing.
4. **Sales: set sell prices, then Generate quote.**
   - Blocked while a request is open, when any line needs a cost, when supplier pricing has expired, or when an estimate or "To be decided" OEM line remains.
   - Each quote is a new version. Earlier open versions become *Superseded*.
5. **Sales: Customer response.**
   - *Accepted*: waiting for the PO.
   - *Wants changes*: a note is required.
   - *Rejected*: the deal stays open until sales closes it.
6. **Won.** Marking the deal Won with a PO accepts the latest live quote automatically, and the lines lock for billing.

## Revisions and send-backs (every loop)

| Situation | Who | What happens |
|---|---|---|
| Customer or sales wants a different scope | Sales: **Request BOQ revision** | A new presales request (revision N+1) with a required reason. Any pricing in progress is cancelled as "Superseded by BOQ revision N", and purchase is told to stop. The source is recorded as *Customer change* if the latest quote had changes requested. |
| Presales needs information | Presales: **Ask sales** | The request pauses (*Waiting on sales*) and the sales owner is notified. On **Answer presales**, work resumes and the due date moves out by however long presales waited. |
| Purchase cannot price what was specified (end-of-life part, wrong SKU, no distributor) | Purchase: **Send back** | The pricing request is marked *Sent back to presales* with the reason. A new high-priority BOQ revision goes to the presales owner, or to sales if presales was never involved. |
| A line's product, quantity, term, billing, OEM or category changes after it was costed | Automatic | The line is marked **Changed · needs re-pricing**. Its old cost is kept for reference but no longer counts. Quoting is blocked until purchase re-confirms it. |
| Only some lines changed | Automatic | Submitting the revision sends **only the changed or new lines** to purchase (*Re-pricing*). Unchanged lines keep their cost. If nothing needs a cost, no pricing request is raised and the deal is ready to quote. |
| Supplier pricing expired, or the customer asks for a refresh | Sales: **Re-validate costs** | Every line goes back to purchase to re-confirm, with a reason. |
| Customer asked for changes on price only | Sales | Change sell prices, then **Issue quote vN+1**. |
| Wrong person, or someone is on leave | Manager, deal owner or current assignee: **Reassign** | The new owner is notified with the same due date. Reminders reset. |
| Work is no longer needed | Manager, deal owner or requester: **Cancel request** | A reason is required. The assignee is told to stop. |
| Deal closed (Won, Lost or Dropped) | Automatic | Open requests are cancelled with "Deal closed as …", and assignees are told to stop work. A live quote becomes Accepted (Won) or Rejected (Lost or Dropped). |
| Deal put on Hold | Automatic | Assignees are told to pause. Requests stay open. |

## Protection against mistakes

- **BOQ lock.** While purchase is pricing, nobody except a manager can change products or quantities, because purchase would otherwise price the wrong thing. Use *Request BOQ revision* instead. While presales is working, only the assigned engineer (or a manager) edits the specification. Sales can still edit sell prices, and purchase can still edit costs.
- **Simultaneous edits.** Each BOQ save carries the version the user loaded. If someone saved in between, the save is rejected with "Someone else saved this BOQ after you opened it" instead of overwriting their work.
- **No orphaned requests.** Only one presales request and one pricing request can be open per deal.
- **Closed deals are read-only.** No requests or quotes can be made on them.
- **Full trail.** Every request, revision, question, answer, send-back, reassignment, cancellation and customer response appears in the deal's request history and audit log.

## Reminders and escalations (automatic)

These run with the rules refresh, at most every 30 minutes. Each one is sent once.

| When | Who is notified |
|---|---|
| A BOQ or pricing request is due within a day | The assignee |
| A BOQ or pricing request is overdue | The assignee, the sales owner and the sales owner's manager (or the Sales Head) |
| A presales question has been unanswered for 2 days | The sales owner (again for each new question) |
| A quote expires within 3 days | The sales owner |

A paused request (*Waiting on sales*) is never counted as overdue against presales.

## Who can do what

| Action | Sales owner | Manager | Presales assignee | Purchase assignee |
|---|---|---|---|---|
| Pull in presales, request BOQ revision | ✓ | ✓ | – | – |
| Answer presales | ✓ | ✓ | – | – |
| Start, ask sales, submit BOQ | – | ✓ | ✓ | – |
| Request pricing, re-pricing or re-validation | ✓ | ✓ | presales owner | – |
| Start pricing, pricing complete, send back | – | ✓ | – | ✓ |
| Reassign a request | ✓ | ✓ | own request | own request |
| Cancel a request | ✓ (or the requester) | ✓ | – | – |
| Generate quote, record customer response | ✓ | ✓ | – | – |
