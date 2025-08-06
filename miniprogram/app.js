// app.js
App({
  onLaunch: function () {
    this.globalData = {};

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }

    // ★★★ 核心修正 ★★★
    // 初始化云开发环境，并指定您的环境ID
    wx.cloud.init({
      env: 'cloud1-2gysfwk2b569a3e5', 
      traceUser: true, 
    });
  },
});