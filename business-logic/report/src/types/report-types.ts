/**
 * Type definitions for report operations
 */

export interface Student {
  studentId: string;
  firstName: string;
  lastName: string;
  license: string;
  behaviors?: Behavior[];
  responses?: Behavior[];
  services?: Service[];
  details?: {
    name?: string;
  };
}

export interface Behavior {
  id: string;
  name: string;
  isDuration?: boolean;
}

export interface Service {
  id: string;
  name: string;
  isDuration?: boolean;
}

export interface User {
  userId: string;
  details?: {
    name?: string;
  };
}

export interface Track {
  id: string;
  name?: string;
}

export interface App {
  id: string;
  deviceName?: string;
}

export interface ExistingNote {
  noteId: string;
  source?: {
    id: string;
    name?: string;
    type?: string;
  };
  createdAt?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface GenerateExcelReportRequest {
  studentId: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  reportType: 'data' | 'worksheet';
}

export interface ExcelReportResponse {
  data: any[][];
  sheetName: string;
  filename: string;
}