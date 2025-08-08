// miniprogram/pages/practice/practice.js (口令版·云函数容错)
const db = wx.cloud.database();
const homeworksCollection = db.collection('homeworks');
const { demoCourse } = require('../../utils/demoData.js');

Page({
  data: {
    homeworks: [],
    pageRole: 'student'
  },

  onLoad: function (options) {
    const role = options.role || 'student';
    this.setData({ pageRole: role });
    this.loadHomeworks(role);
  },

  async loadHomeworks(role) {
    wx.showLoading({ title: '加载中...' });
    let homeworksToShow = [];
    try {
      // 优先用云函数（统一环境、规避端侧规则差异）
      const res = await wx.cloud.callFunction({ name: 'listHomeworks' });
      const ok = res && res.result && res.result.ok;
      const realHomeworks = ok ? (res.result.data || []) : [];

      if (role === 'guest' || role === 'preview') {
        homeworksToShow = realHomeworks.length > 0 ? realHomeworks : [demoCourse];
      } else {
        // 学生端：云函数没数据就用空列表（或你也可改成体验模式）
        homeworksToShow = realHomeworks;
      }
    } catch (err) {
      // 云函数不可用（未部署/权限/网络），进入安全降级
      if (role === 'guest' || role === 'preview') {
        homeworksToShow = [demoCourse];
      } else {
        // 也可改成体验数据：homeworksToShow = [demoCourse];
        wx.showToast({ title: '作业加载失败', icon: 'none' });
      }
    }

    const enhancedHomeworks = (homeworksToShow || []).map(hw => ({
      ...hw,
      id: hw._id || hw.id,
      wordCount: (hw.words || []).length,
      estimatedTime: Math.ceil(((hw.words || []).length * 20) / 60)
    }));

    this.setData({ homeworks: enhancedHomeworks });
    wx.hideLoading();
  },

  startPractice: function (e) {
    const homeworkId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${homeworkId}&role=${this.data.pageRole}`
    });
  }
});