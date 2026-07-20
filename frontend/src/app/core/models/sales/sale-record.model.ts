import { TenderType } from '../payment/payment.model';

export type SaleRecordStatus = 'Completed' | 'Pending' | 'Refunded';

export interface SaleRecord {
  id: string;
  confirmationNumber: string;
  customerName: string;
  itemCount: number;
  total: number;
  tenderType: TenderType;
  soldAt: Date;
  status: SaleRecordStatus;
}
