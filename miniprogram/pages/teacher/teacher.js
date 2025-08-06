// pages/teacher/teacher.js
const storage = require('../../utils/storage.js');
const app = getApp();

Page({
  data: {
    homeworkList: [],
    teacherName: '',
    isPreviewMode: false // 预览模式的状态开关
  },

  onShow: function() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo._openid) {
      app.globalData.userInfo = userInfo;
      this.setData({ teacherName: userInfo.nickName });
      this.loadData();
    } else {
      wx.showModal({
        title: '认证失败',
        content: '无法获取您的教师身份，请重新登录。',
        showCancel: false,
        success: () => wx.reLaunch({ url: '/pages/index/index' })
      });
    }
  },

  loadData() {
    this.setData({
      homeworkList: storage.loadHomeworks().reverse()
    });
  },

  // 将“进入学生模式”升级为“切换预览模式”
  togglePreviewMode() {
    this.setData({
      isPreviewMode: !this.data.isPreviewMode
    });
  },

  // 根据模式决定卡片点击行为
  onCardTap(e) {
    const { id, name } = e.currentTarget.dataset;
    if (this.data.isPreviewMode) {
      // 预览模式下：跳转到答题页
      wx.navigateTo({
        url: `/pages/detail/detail?id=${id}&role=preview`
      });
    } else {
      // 正常模式下：跳转到学情报告页
      wx.navigateTo({
        url: `/pages/report/report?id=${id}&title=${name}`
      });
    }
  },

  goToCreatePage() {
    wx.navigateTo({ url: '/pages/create/create' });
  },

  goToEditPage(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/create/create?id=${id}`
    });
  },

  onDeleteTap(e) {
    const homeworkId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复。',
      confirmText: '删除',
      confirmColor: '#e74c3c',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const allHomeworks = storage.loadHomeworks();
          const newHomeworkList = allHomeworks.filter(hw => hw.id !== homeworkId);
          storage.saveHomeworks(newHomeworkList);
          this.loadData();
        }
      }
    })
  },

  goToProfilePage() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    });
  }
});