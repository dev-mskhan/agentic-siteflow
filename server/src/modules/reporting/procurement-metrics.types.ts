import type { PurchaseOrderStatus } from "@prisma/client";

export interface MaterialRequestSummary {
  total: number;
  draft: number;
  /** SUBMITTED status — awaiting approval */
  pending: number;
  approved: number;
  fulfilled: number;
  rejected: number;
}

export interface PurchaseOrderSummary {
  total: number;
  byStatus: Record<PurchaseOrderStatus, number>;
  totalCommittedValue: number;
  /** expectedDeliveryDate < today AND status not RECEIVED/CANCELLED */
  overdueDeliveries: number;
}

export interface DeliverySummary {
  total: number;
  onTime: number;
  delayed: number;
  /** Sum of delayedDays across all delayed deliveries */
  totalDelayedDays: number;
  /** Status SCHEDULED or IN_TRANSIT */
  pendingReceipt: number;
}

export interface DelayedItem {
  poNumber: string;
  vendorName: string;
  delayedDays: number;
  expectedDate: string;
}

export interface ProcurementMetrics {
  projectId: string;
  computedAt: string;
  materialRequests: MaterialRequestSummary;
  purchaseOrders: PurchaseOrderSummary;
  deliveries: DeliverySummary;
  /** Top 5 deliveries by delay days */
  topDelayedItems: DelayedItem[];
}
