import { isoDate } from "./format";

export type OppFormValues = Record<string, string>;

export function emptyOppValues(userId: string, accountId?: string): OppFormValues {
  return {
    name: "", accountId: accountId ?? "", primaryContactId: "", businessUnitId: "", categoryId: "", oemId: "",
    accountType: "NEW_LOGO", revenueModel: "ONE_TIME", dealType: "NEW_BUSINESS", procurementMode: "DIRECT", amount: "",
    arrAmount: "", contractTermMonths: "", contractStartDate: "", expectedMarginPct: "", stage: "IDENTIFIED", probability: "10",
    forecastCategory: "PIPELINE", expectedCloseDate: isoDate(new Date(Date.now() + 90 * 86_400_000)), salesOwnerId: userId,
    presalesOwnerId: "", leadSource: "", competitors: "", nextStep: "", nextStepDate: "", submissionDueDate: "",
    dealRegStatus: "NOT_REQUIRED", dealRegNumber: "", dealRegExpiry: "", lossReason: "", lossNotes: "", poNumber: "", poDate: "",
    description: "",
  };
}
