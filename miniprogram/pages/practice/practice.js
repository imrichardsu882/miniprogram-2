// miniprogram/pages/practice/practice.js (最终·智能加载版)
const storage = require('../../utils/storage.js');
const { demoCourse } = require('../../utils/demoData.js'); // 导入共享数据
const app = getApp();

Page({
  data: {
    homeworks: [],
    pageRole: 'student' // 默认为学生
  },

  onLoad: function (options) {
    const role = options.role || 'student'; 
    this.setData({ pageRole: role });
    this.loadHomeworks(role);
  },

  loadHomeworks: function(role) {
    let homeworksToShow = [];

    // ★★★ 核心改造：实现智能加载逻辑 ★★★
    if (role === 'guest') {
      // 游客模式：优先加载真实作业，如果真实作业为空，则加载体验课程作为保底
      const realHomeworks = storage.loadHomeworks();
      if (realHomeworks && realHomeworks.length > 0) {
        homeworksToShow = realHomeworks;
      } else {
        homeworksToShow = [demoCourse];
      }
    } else if (role === 'preview') {
      // 老师预览模式：也采用和游客一样的逻辑，优先真实，否则保底
      const realHomeworks = storage.loadHomeworks();
      if (realHomeworks && realHomeworks.length > 0) {
        homeworksToShow = realHomeworks;
      } else {
        homeworksToShow = [demoCourse];
      }
    }
    else {
      // 正式学生：只加载真实作业
      homeworksToShow = storage.loadHomeworks();
    }
    
    const enhancedHomeworks = homeworksToShow.map(hw => ({
      ...hw,
      wordCount: hw.words.length,
      estimatedTime: Math.ceil(hw.words.length * 20 / 60)
    })).reverse();

    this.setData({ homeworks: enhancedHomeworks });
  },

  startPractice: function (e) {
    const homeworkId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${homeworkId}&role=${this.data.pageRole}`
    });
  }
});