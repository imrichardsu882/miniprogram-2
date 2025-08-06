// pages/report/report.js
Page({
  data: {
    homeworkId: null,
    homeworkTitle: '',
    reportData: null,
    isLoading: true,
    activeTab: 'completed'
  },

  onLoad: function (options) {
    const { id, title } = options;
    if (!id || !title) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.setData({ homeworkId: Number(id), homeworkTitle: title });
    wx.setNavigationBarTitle({ title: `“${title}”学情报告` });
    this.loadReport();
  },

  loadReport: function() {
    this.setData({ isLoading: true });
    wx.cloud.callFunction({
      name: 'getHomeworkReport',
      data: { homeworkId: this.data.homeworkId }
    }).then(res => {
      // ★★★ 核心改造：增加对返回结果的健壮性判断 ★★★
      if (res.result && res.result.success && res.result.data) {
        this.setData({
          reportData: res.result.data
        });
      } else {
        wx.showToast({ title: '分析学情失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    }).finally(() => {
      // ★★★ 核心改造：确保“加载中”提示一定会被隐藏 ★★★
      this.setData({ isLoading: false });
    });
  },

  switchTab: function(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  }
});