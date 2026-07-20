export type TenderType = 'cash' | 'card';

export interface TenderSelection {
  tenderType: TenderType;
  tenderedAmount: number;
}

export interface PaymentRequest {
  customerName: string;
  lineItemCount: number;
  saleTotal: number;
  tenderType: TenderType;
  tenderedAmount: number;
}

export interface PaymentReceipt {
  confirmationNumber: string;
  processedAt: Date;
  customerName: string;
  lineItemCount: number;
  saleTotal: number;
  tenderType: TenderType;
  tenderedAmount: number;
  changeDue: number;
}
