/**
 * Public config routes (no auth required)
 *
 * 合规改造 (2026-06-22 P2-1): 小程序前端需要拉取当前生效的价格/配置,
 * 但 /api/admin/prices 需要 admin 角色,小程序用户拿不到。
 *
 * 解决方案: 暴露一个公开只读接口 /api/config/prices,
 * 返回经过 defaultPrices + priceConfig 数据库合并后的最终价格。
 *
 * 这等价于让前端价格跟管理员后台设置的"当前生效价格"实时联动。
 *
 * 安全性:
 *   - 只读, 没有 mutation
 *   - 字段跟 defaultPrices 完全一致, 不会泄露内部状态
 *   - 不需要鉴权(价格本身就是面向 C 端展示的)
 *
 * 路由:
 *   GET /api/config/prices   → 全部价格 (含 voiceClone 等)
 *   GET /api/config/prices/:key → 单个价格
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAllPrices, getPrice } from '../../services/price.service.js';

export async function configRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/config/prices
   * 返回当前生效的全部价格 (管理员后台修改后立即生效, 前端可定期缓存)
   */
  fastify.get('/prices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const prices = await getAllPrices();
      return reply.send({
        success: true,
        data: {
          prices,
          // 元数据, 方便前端做 cache-busting 或显示 "价格更新时间"
          currency: 'CNY',
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get prices',
        code: 'GET_PRICES_ERROR',
      });
    }
  });

  /**
   * GET /api/config/prices/:key
   * 返回单个价格 key (前端最常用: voiceClone)
   */
  fastify.get<{ Params: { key: string } }>(
    '/prices/:key',
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      try {
        const { key } = request.params;
        const value = await getPrice(key);
        return reply.send({
          success: true,
          data: {
            key,
            value,
            currency: 'CNY',
            fetchedAt: new Date().toISOString(),
          },
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          message: error.message || 'Failed to get price',
          code: 'GET_PRICE_ERROR',
        });
      }
    }
  );
}

export default configRoutes;