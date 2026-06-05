/**
 * 错误处理中间件
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

/**
 * 自定义业务错误类
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400, code: string = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 常见错误工厂函数
 */
export const Errors = {
  badRequest: (message: string, code = 'BAD_REQUEST') =>
    new AppError(message, 400, code),

  unauthorized: (message: string = '未授权访问', code = 'UNAUTHORIZED') =>
    new AppError(message, 401, code),

  forbidden: (message: string = '无权限访问', code = 'FORBIDDEN') =>
    new AppError(message, 403, code),

  notFound: (message: string = '资源不存在', code = 'NOT_FOUND') =>
    new AppError(message, 404, code),

  conflict: (message: string = '资源冲突', code = 'CONFLICT') =>
    new AppError(message, 409, code),

  internal: (message: string = '服务器内部错误', code = 'INTERNAL_ERROR') =>
    new AppError(message, 500, code),

  tooManyRequests: (message: string = '请求过于频繁', code = 'RATE_LIMITED') =>
    new AppError(message, 429, code),
};

/**
 * Fastify 错误处理器
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = request.id;

  // Log error
  request.log.error({
    err: error,
    requestId,
    url: request.url,
    method: request.method,
  });

  // Handle AppError (operational errors)
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      code: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  // Handle JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.status(401).send({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Token无效或已过期',
    });
  }

  // Handle other Fastify errors
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      success: false,
      code: error.code || 'ERROR',
      message: error.message,
    });
  }

  // Unknown errors - return 500
  return reply.status(500).send({
    success: false,
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? '服务器内部错误'
      : error.message,
  });
}