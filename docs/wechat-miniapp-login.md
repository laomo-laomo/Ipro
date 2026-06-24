# WeChat Mini Program Login

Use this flow when testing real WeChat Mini Program one-tap login.

## Backend Environment

Set these values in the local `.env` file and restart the API server:

```env
WECHAT_APP_ID=wxf50e30f22328445b
WECHAT_APP_SECRET=your-mini-program-secret
WECHAT_LOGIN_TYPE=miniapp
```

Do not commit or paste the real `WECHAT_APP_SECRET` into chat, logs, or docs.

## Mini Program Request

Call `wx.login`, send the returned `code` to the API, and store the returned JWT token.

```js
wx.login({
  success(res) {
    if (!res.code) {
      wx.showToast({ title: '微信登录失败', icon: 'none' });
      return;
    }

    wx.request({
      url: 'http://YOUR_API_HOST:3001/api/auth/wechat-login',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { code: res.code },
      success(loginRes) {
        const body = loginRes.data;
        if (!body?.success || !body?.data?.token) {
          wx.showToast({ title: body?.message || '登录失败', icon: 'none' });
          return;
        }

        wx.setStorageSync('auth_token', body.data.token);
        wx.setStorageSync('user', body.data.user);
      },
      fail() {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },
});
```

For local real-device testing, replace `YOUR_API_HOST` with the computer's LAN IP. For production Mini Programs, configure an HTTPS request domain in the WeChat Mini Program admin console.

## Protected API Calls

Send the token returned by login as a bearer token:

```js
wx.request({
  url: 'https://YOUR_API_DOMAIN/api/stories',
  method: 'GET',
  header: {
    Authorization: `Bearer ${wx.getStorageSync('auth_token')}`,
  },
});
```
