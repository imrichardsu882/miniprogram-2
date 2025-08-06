// pages/profile/profile.js
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 从本地持久化存储中，安全地读取用户信息并展示
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo: userInfo });
    }
  },

  /**
   * 核心功能：退出登录
   */
  logout: function() {
    wx.showModal({
      title: '提示',
      content: '您确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 1. 清除本地身份缓存
          wx.removeStorageSync('userInfo');
          // 2. 清除全局变量
          app.globalData.userInfo = null;
          // 3. 重启到门户页，回到最初始的状态
          wx.reLaunch({
            url: '/pages/index/index'
          });
        }
      }
    });
  }
})