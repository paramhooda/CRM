/** Business-readable names for fields that appear in history and audit views. */
export const FIELD_LABEL: Record<string, string> = {
  name: "Name", stage: "Stage", ownerId: "Owner", presalesOwnerId: "Presales owner", primaryContactId: "Customer contact", expectedCloseDate: "Expected close",
  forecastCategory: "Forecast", needsPresales: "Needs presales", leadSourceId: "Lead source", description: "Description", nextStep: "Next step", nextStepDate: "Next step date",
  holdReason: "Hold reason", lossReasonId: "Loss reason", lossNotes: "Loss notes", poNumber: "PO number", dealValue: "Deal value", oneTimeValue: "One-time value",
  annualRecurringValue: "Annual recurring value", totalCost: "Total cost", expectedGmPct: "Expected GM %", primaryBusinessUnitId: "Primary BU", primaryOemId: "Primary OEM",
  approval: "Approval", productId: "Product", businessUnitId: "Business unit", subBusinessUnitId: "Sub BU", oemId: "OEM", quantity: "Quantity", unit: "Unit",
  revenueModel: "Revenue model", termMonths: "Term (months)", unitSalesPrice: "Unit sales price", unitPurchaseCost: "Unit purchase cost", salesMethodId: "Sales method",
  lineValue: "Line value", annualValue: "Annual value", lineCost: "Line cost", status: "Status", assignedToId: "Assigned to", dueDate: "Due date", scope: "Scope", notes: "Notes",
  summary: "Summary", completionNotes: "Completion notes", gstin: "GSTIN", industryId: "Industry", segmentId: "Segment", website: "Website", phone: "Phone", mobile: "Mobile",
  addressLine: "Address", city: "City", state: "State", pincode: "Pincode", email: "Email", firstName: "First name", lastName: "Last name", designation: "Designation",
  department: "Department", isPrimary: "Primary contact", accountId: "Account", companyName: "Company", contactName: "Contact", contactEmail: "Contact email",
  contactPhone: "Contact phone", estimatedValue: "Estimated value", disqualifyReason: "Disqualify reason", role: "Role", managerId: "Manager", isActive: "Active",
  fullName: "Full name", title: "Title", mustChangePassword: "Must change password", code: "Code", listPrice: "List price", standardCost: "Standard cost", hsnSac: "HSN/SAC",
  defaultTermMonths: "Default term", isOwnIp: "Own IP", colourToken: "Colour", sortOrder: "Sort order", appliesTo: "Applies to", restrictedToSales: "Sales only",
  requiredAtWon: "Required at Won", targetValue: "Target", fileName: "File", documentKindId: "Document kind",
};

export const fieldLabel = (f: string | null | undefined) => (f ? FIELD_LABEL[f] ?? f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : "");

export const ENTITY_LABEL: Record<string, string> = {
  deal: "Deal", deal_line: "Deal line", account: "Account", contact: "Contact", lead: "Lead", user: "User", product: "Product", presales_request: "Presales request",
  pricing_request: "Pricing request", deal_document: "Document", approval_rule: "Approval rule", deal_approval: "Approval", sales_target: "Target", pipeline_review: "Pipeline review", session: "Session",
};
export const entityLabel = (e: string) => ENTITY_LABEL[e] ?? e.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const REVENUE_MODEL_LABEL = { ONE_TIME: "One-time", ARR: "ARR" } as const;
export const ACTION_LABEL: Record<string, string> = { CREATE: "Created", UPDATE: "Changed", DELETE: "Deleted", RESTORE: "Restored", STAGE_CHANGE: "Stage changed", LOGIN: "Signed in", LOGOUT: "Signed out" };
