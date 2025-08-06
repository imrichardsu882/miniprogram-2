// pages/practice/practice.js
const storage = require('../../utils/storage.js');
const { demoCourse } = require('../../utils/demoData.js'); // 导入共享数据
const app = getApp();

Page({
  data: {
    homeworks: [],
    pageRole: 'student' // 默认为学生
  },

  onLoad: function (options) {
    const role = options.role || 'student'; // 如果没传参数，安全起见默认为学生
    this.setData({ pageRole: role });
    this.loadHomeworks(role);
  },

  loadHomeworks: function(role) {
    let homeworksToShow = [];
    if (role === 'preview' || role === 'guest') {
      // 如果是老师预览或游客，加载预设的体验课程
      homeworksToShow = [demoCourse]; 
    } else {
      // 如果是正式学生，从本地缓存加载
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