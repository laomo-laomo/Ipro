/**
 * 统一响应格式工具
 */

export interface ResponseData<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

/**
 * 成功响应
 */
export function success<T>(data?: T, message?: string): ResponseData<T> {
  return {
    success: true,
    data,
    message,
  };
}

/**
 * 简单成功响应（无 data）
 */
export function ok(message?: string): ResponseData {
  return {
    success: true,
    message,
  };
}

/**
 * 错误响应
 */
export function error(message: string, code?: string): ResponseData {
  return {
    success: false,
    message,
    code,
  };
}

/**
 * 分页响应
 */
export interface PaginatedData<T = unknown> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginated<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedData<T> {
  return {
    list,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}