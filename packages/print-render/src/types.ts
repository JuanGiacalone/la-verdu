export type PrintKind = "NEW" | "MODIFICATION" | "CANCELLATION";

export type PrintFulfillment = "PICKUP" | "DELIVERY";

export interface PrintItem {
  readonly quantity: number;
  readonly unit: "KG" | "UNIT" | "BUNCH";
  readonly productName: string;
}

export interface PrintJobData {
  readonly branchShortName: string;
  readonly orderNumber: number;
  readonly version: number;
  readonly kind: PrintKind;
  readonly confirmedAt: Date;
  readonly customerName: string;
  readonly fulfillment: PrintFulfillment;
  readonly pickupTime?: string;
  readonly deliveryAddress?: string;
  readonly deliveryTime?: string;
  readonly paymentMethodName: string;
  readonly paymentStatus: "TO_COLLECT" | "PAID";
  readonly derived: boolean;
  readonly preferredBranchShortName?: string;
  readonly items: readonly PrintItem[];
  readonly notes?: string;
}

export interface RenderedPrint {
  readonly bytes: Uint8Array;
  readonly preview: string;
}
