// pages/profile/profile.js
const app = getApp();
const db = wx.cloud.database();
const users = db.collection('users');
const records = db.collection('homework_records');

Page({
  data: { 
    userInfo: null,
    editingSignature: false,
    signatureInput: '',
    userStats: null
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
      this.loadUserStats();
    }
  },

  onShow() {
    // 每次显示页面时重新加载用户信息，确保签名等信息是最新的
    this.loadUserInfo();
  },

  async loadUserInfo() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo._openid) {
        const res = await users.where({ _openid: userInfo._openid }).get();
        if (res.data && res.data.length > 0) {
          const updatedUserInfo = { ...userInfo, ...res.data[0] };
          this.setData({ userInfo: updatedUserInfo });
          wx.setStorageSync('userInfo', updatedUserInfo);
        }
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  },

  async loadUserStats() {
    try {
      const userInfo = this.data.userInfo;
      if (!userInfo || !userInfo._openid) return;

      // 获取用户的作业记录
      const recordsRes = await records.where({ 
        userOpenId: userInfo._openid 
      }).get();
      
      const userRecords = recordsRes.data || [];
      
      if (userRecords.length === 0) {
        this.setData({
          userStats: {
            totalHomeworks: 0,
            avgScore: 0,
            totalTime: '0分钟',
            bestRank: '暂无'
          }
        });
        return;
      }

      // 计算统计数据
      const totalHomeworks = userRecords.length;
      const totalScore = userRecords.reduce((sum, record) => sum + (Number(record.score) || 0), 0);
      const avgScore = Math.round(totalScore / totalHomeworks);
      const totalTimeMs = userRecords.reduce((sum, record) => sum + (Number(record.durationMs) || 0), 0);
      const totalTimeMinutes = Math.round(totalTimeMs / 1000 / 60);
      
      this.setData({
        userStats: {
          totalHomeworks,
          avgScore,
          totalTime: `${totalTimeMinutes}分钟`,
          bestRank: '计算中...' // 这里可以后续通过排行榜数据计算
        }
      });
    } catch (error) {
      console.error('加载用户统计失败:', error);
    }
  },

  // 开始编辑签名
  startEditSignature() {
    this.setData({ 
      editingSignature: true,
      signatureInput: this.data.userInfo.sign || ''
    });
  },

  // 签名输入
  onSignatureInput(e) {
    this.setData({ signatureInput: e.detail.value });
  },

  // 取消编辑签名
  cancelEditSignature() {
    this.setData({ 
      editingSignature: false,
      signatureInput: ''
    });
  },

  // 保存签名
  async saveSignature() {
    const signature = this.data.signatureInput.trim();
    
    if (signature.length > 20) {
      wx.showToast({ title: '签名不能超过20字', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });
      
      const userInfo = this.data.userInfo;
      
      // 更新数据库中的用户信息
      await users.where({ _openid: userInfo._openid }).update({
        data: { sign: signature }
      });

      // 更新本地数据
      const updatedUserInfo = { ...userInfo, sign: signature };
      this.setData({ 
        userInfo: updatedUserInfo,
        editingSignature: false,
        signatureInput: ''
      });
      
      // 更新本地存储
      wx.setStorageSync('userInfo', updatedUserInfo);
      
      wx.showToast({ title: '签名保存成功', icon: 'success' });
    } catch (error) {
      console.error('保存签名失败:', error);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  logout() {
    wx.showModal({
      title: '提示',
      content: '您确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('teacherAuth'); // 清除老师口令授权
          app.globalData.userInfo = null;
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  }
});