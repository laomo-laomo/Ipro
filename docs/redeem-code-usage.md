# Redeem Code Usage Guide

This project currently uses sales-issued redeem codes instead of direct WeChat Pay checkout.

## Roles

- Admin: creates, searches, and disables redeem codes in the admin console.
- Sales: sends valid codes to customers after offline payment or manual approval.
- User: enters the code on the membership page to receive points or membership benefits.

## Admin: Create Codes

1. Log in with an admin account.
2. Open `/admin/redeem-codes`.
3. Choose a reward type:
   - `会员卡`: weekly, monthly, quarterly, or yearly membership.
   - `积分`: a fixed point amount.
4. Set quantity, optional expiration time, and a useful note such as campaign name, salesperson, or customer batch.
5. Click `生成兑换码`.
6. Copy the generated codes and give them to sales.

Recommended note format:

```text
2026-06 campaign / salesperson / customer or channel
```

## Sales: Send Codes

Send one code per customer unless a campaign intentionally allows shared distribution. Keep a local record of:

- Customer name or phone.
- Code sent.
- Reward type.
- Payment or approval proof.
- Date sent.

Do not send screenshots that expose unrelated unused codes.

## User: Redeem Codes

1. Log in.
2. Open `/membership`.
3. Enter the redeem code in the `兑换码` section.
4. Click `立即兑换`.
5. The account receives points or membership immediately after success.

Membership redemption extends the currently active membership when one exists. Points redemption adds to the user's point balance.

## Admin: Search And Disable

Use `/admin/redeem-codes` to search by code, status, or reward type.

Statuses:

- `active`: valid and unused.
- `used`: already redeemed by a user.
- `expired`: expired and no longer valid.
- `disabled`: manually invalidated.

Only active, unused codes should be disabled. Used codes are kept as audit history.

## Common Failure Messages

- `兑换码不存在`: code is wrong or not generated in this environment.
- `兑换码已失效`: admin disabled the code.
- `兑换码已被使用`: another account already redeemed the code.
- `兑换码已过期`: the expiration time has passed.
- `兑换码配置错误`: the code was generated with invalid reward settings and should be replaced.

## Production Checklist

- Create at least one admin account before launch.
- Sync the Prisma schema to the production database.
- Generate codes only in the production admin console for real customers.
- Keep `.env` secrets out of docs, chat, and screenshots.
- If payment checkout is intentionally paused, keep the membership page focused on redeem-code activation.
