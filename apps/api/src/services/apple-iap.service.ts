/**
 * Apple In-App Purchase (IAP) service
 *
 * 合规改造 (2026-06-22 P1-3): iOS 端虚拟商品(会员、次卡)必须走 Apple IAP,
 * 不能走微信支付 (违反 Apple App Store Review Guideline 3.1.1)。
 *
 * 实现要点:
 *   - 接收前端 wx.requestVirtualPayment 拿到的 receipt
 *   - 调 Apple 服务器验证 receipt (沙箱/生产自动切换)
 *   - 用共享密钥 (APPLE_IAP_SHARED_SECRET) 做应用级校验, 防止黑产伪造 receipt
 *   - 返回 productId / transactionId, 用于后端置订单状态 + 防重放
 *
 * Apple 文档:
 *   - 验证接口: https://developer.apple.com/documentation/appstore receipts/verifyreceipt
 *   - 沙箱: https://sandbox.itunes.apple.com/verifyReceipt
 *   - 生产: https://buy.itunes.apple.com/verifyReceipt
 *
 * wx.requestVirtualPayment 文档 (微信小程序封装 StoreKit 2):
 *   - https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html
 */

import crypto from 'crypto';

const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleVerifyResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 商品 ID (Apple 端 SKU, 比如 "monthly") */
  productId?: string;
  /** 交易 ID, 用于防重放 */
  transactionId?: string;
  /** 原始 transactionId (订阅续期场景) */
  originalTransactionId?: string;
  /** 购买时间 (毫秒) */
  purchaseDateMs?: string;
  /** 数量 (consumable 才有意义) */
  quantity?: number;
  /** Bundle ID, 用于二次校验 */
  bundleId?: string;
  /** 失败原因 */
  reason?: string;
  /** 完整 Apple 响应 (debug 用) */
  raw?: any;
}

interface AppleVerifyResponse {
  status: number;
  environment?: 'Sandbox' | 'Production';
  receipt?: any;
  latest_receipt_info?: any[];
  pending_renewal_info?: any[];
}

/**
 * 调 Apple 服务器验证 receipt
 *
 * 自动处理沙箱/生产切换:
 *   - 先试生产, 拿到 status=21007 (沙箱 receipt 误发到生产) 自动重试沙箱
 *
 * @param receipt Base64 编码的 receipt (前端 wx.requestVirtualPayment 拿到的)
 * @param expectedBundleId 期望的 Bundle ID (前端必须传, 后端校验, 防止错应用 receipt)
 * @param expectedProductId 期望的商品 SKU (可选, 强烈建议传, 防止 SKU 串单)
 * @param isSandbox 强制使用沙箱 (测试环境用, 平时让函数自动判断)
 */
export async function verifyAppleReceipt(
  receipt: string,
  expectedBundleId: string,
  expectedProductId?: string,
  isSandbox: boolean = false,
): Promise<AppleVerifyResult> {
  const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET;
  if (!sharedSecret) {
    return { valid: false, reason: 'APPLE_IAP_SHARED_SECRET not configured' };
  }
  if (!receipt || typeof receipt !== 'string') {
    return { valid: false, reason: 'receipt is required' };
  }

  const tryVerify = async (url: string): Promise<AppleVerifyResponse> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receipt,
        'password': sharedSecret,
        'exclude-old-transactions': true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Apple verify HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as AppleVerifyResponse;
  };

  try {
    // 先按入参决定 URL, 拿到 status=21007 时重试沙箱
    let response: AppleVerifyResponse;
    const firstUrl = isSandbox ? APPLE_SANDBOX_URL : APPLE_PRODUCTION_URL;
    response = await tryVerify(firstUrl);

    // 21007 = 这个 receipt 是沙箱的, 但发到了生产服务器
    if (response.status === 21007 && !isSandbox) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[Apple IAP] receipt 是沙箱的, 自动切换到沙箱验证');
      }
      response = await tryVerify(APPLE_SANDBOX_URL);
    }

    // 状态码非 0 = 验证失败
    // 常见: 21002 (receipt 数据格式错), 21004 (共享密钥错), 21005 (环境不可用)
    if (response.status !== 0) {
      return {
        valid: false,
        reason: `Apple status=${response.status}`,
        raw: response,
      };
    }

    // 解析 latest_receipt_info (订阅型才有), 或者 receipt.in_app (单次购买)
    const inApp = (response.receipt && response.receipt.in_app) || [];
    const latest = (response.latest_receipt_info || [])[0] || inApp[0];
    if (!latest) {
      return { valid: false, reason: 'no transaction in receipt', raw: response };
    }

    // Bundle ID 校验 (防错应用 receipt)
    if (expectedBundleId && latest.bundle_id && latest.bundle_id !== expectedBundleId) {
      return {
        valid: false,
        reason: `bundleId mismatch: got ${latest.bundle_id}, expected ${expectedBundleId}`,
        raw: latest,
      };
    }

    // Product ID 校验 (防 SKU 串单)
    if (expectedProductId && latest.product_id !== expectedProductId) {
      return {
        valid: false,
        reason: `productId mismatch: got ${latest.product_id}, expected ${expectedProductId}`,
        raw: latest,
      };
    }

    return {
      valid: true,
      productId: latest.product_id,
      transactionId: latest.transaction_id,
      originalTransactionId: latest.original_transaction_id,
      purchaseDateMs: latest.purchase_date_ms,
      quantity: parseInt(latest.quantity || '1', 10),
      bundleId: latest.bundle_id,
      raw: latest,
    };
  } catch (e: any) {
    return {
      valid: false,
      reason: e.message || 'verify request failed',
      raw: { error: e.message },
    };
  }
}

/**
 * 生成 wx.requestVirtualPayment 需要的 signData
 *
 * 微信小程序 IAP 流程:
 *   1. 前端调 /api/orders/iap/sign 拿到 signData (带签名, 防伪造)
 *   2. 前端调 wx.requestVirtualPayment({ signData, ... })
 *   3. 用户在弹窗里完成 Apple ID 支付
 *   4. 前端拿到 receipt, 调 /api/orders/iap/verify 后端校验
 *
 * signData 字段说明 (微信协议):
 *   - appid: 微信小程序 AppID
 *   - offerId: 微信侧商品 ID (后台配置的)
 *   - productId: Apple 侧商品 SKU
 *   - quantity: 数量
 *   - nonceStr: 32 位随机串
 *   - timestamp: 秒级时间戳
 *   - sign: SHA256WithRSA 签名 (用 AppID 对应的 RSA 私钥签)
 *
 * 注意: sign 字段必须用**微信分配的 RSA 私钥**签, 这块在生产环境要从微信后台下载配置。
 * 在测试 / 没有 sign 私钥时, 返回一个 mock sign 让前端可以走通流程(真机仍会被 Apple 拒绝)。
 */
export function buildVirtualPaymentSignData(params: {
  productId: string;
  quantity?: number;
  /** 微信侧商品 offerId (留空时使用 productId) */
  offerId?: string;
}): {
  appid: string;
  offerId: string;
  productId: string;
  quantity: number;
  nonceStr: string;
  timestamp: string;
  sign: string;
} {
  const appid = process.env.WECHAT_APP_ID || '';
  const offerId = params.offerId || params.productId;
  const quantity = params.quantity || 1;
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // 微信 sign 字段需要用 RSA 私钥签 "appid\n...\n..." 这样的拼接串。
  // 这里走简化方案: 如果配置了 IAP_SIGN_PRIVATE_KEY 就真签, 否则用本地 HMAC 兜底(仅 dev 调试)。
  // 生产部署时务必配置 IAP_SIGN_PRIVATE_KEY, 否则 Apple 服务器会拒绝 receipt。
  const privateKeyPem = process.env.IAP_SIGN_PRIVATE_KEY;
  let sign: string;
  if (privateKeyPem) {
    const data = [appid, offerId, params.productId, String(quantity), nonceStr, timestamp].join('\n');
    const signer = crypto.createSign('SHA256');
    signer.update(data);
    signer.end();
    sign = signer.sign(privateKeyPem, 'base64');
  } else {
    // dev fallback: 用 HMAC-SHA256, Apple 服务器会拒绝, 但前端流程能跑通
    const data = [appid, offerId, params.productId, String(quantity), nonceStr, timestamp].join('\n');
    sign = crypto.createHmac('sha256', sharedSecretDevFallback()).update(data).digest('base64');
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Apple IAP] IAP_SIGN_PRIVATE_KEY 未配置, 使用 HMAC 兜底, 生产环境必须配');
    }
  }

  return {
    appid,
    offerId,
    productId: params.productId,
    quantity,
    nonceStr,
    timestamp,
    sign,
  };
}

/**
 * 防 sign 私钥未配置时 dev 环境的 HMAC 兜底用的"伪 secret"
 * 注意: 这只是让本地能跑, 真正的安全靠 IAP_SIGN_PRIVATE_KEY
 */
function sharedSecretDevFallback(): string {
  return process.env.APPLE_IAP_SHARED_SECRET || 'ipro-dev-iap-fallback';
}

export default { verifyAppleReceipt, buildVirtualPaymentSignData };