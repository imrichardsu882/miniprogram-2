// miniprogram/pages/teacher/teacher.js（口令授权版）
const db = wx.cloud.database();
const homeworksCollection = db.collection('homeworks');
const app = getApp();
const TEACHER_PASSWORD = '333';

function isTeacherAuthed() {
  const t = wx.getStorageSync('teacherAuth');
  return !!(t && t.ok && t.exp > Date.now());
}
function grantTeacherAuth() {
  const token = { ok: true, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  wx.setStorageSync('teacherAuth', token);
}

Page({
  data: {
    homeworkList: [],
    teacherName: '',
    isPreviewMode: false,
    // 口令弹窗
    showPasswordModal: false,
    passwordInput: ''
  },

  onShow() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!(userInfo && userInfo._openid)) {
      wx.showModal({
        title: '请先登录',
        content: '需要先完成微信登录',
        showCancel: false,
        success: () => wx.reLaunch({ url: '/pages/index/index' })
      });
      return;
    }
    app.globalData.userInfo = userInfo;
    this.setData({ teacherName: userInfo.nickName || '' });

    if (isTeacherAuthed()) {
      this.loadData();
    } else {
      this.setData({ showPasswordModal: true, passwordInput: '' });
    }
  },

  async loadData() {
    wx.showLoading({ title: '加载中...' });
    try {
      // 老师页默认只看自己发布的；如需全部可见，把 where 去掉即可
      const res = await homeworksCollection
        .where({ creatorOpenId: app.globalData.userInfo._openid })
        .orderBy('createTime', 'desc')
        .get();
      const list = res.data.map(item => ({ ...item, id: item._id }));
      this.setData({ homeworkList: list });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  togglePreviewMode() { this.setData({ isPreviewMode: !this.data.isPreviewMode }); },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.isPreviewMode) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}&role=preview` });
    }
  },

  goToCreatePage() { wx.navigateTo({ url: '/pages/create/create' }); },
  goToEditPage(e) { wx.navigateTo({ url: `/pages/create/create?id=${e.currentTarget.dataset.id}` }); },

  onDeleteTap(e) {
    const homeworkId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复。',
      confirmText: '删除',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          try {
            await homeworksCollection.doc(homeworkId).remove();
            this.setData({ homeworkList: this.data.homeworkList.filter(hw => hw.id !== homeworkId) });
            wx.showToast({ title: '删除成功' });
          } catch {
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    })
  },

  // 口令弹窗
  onPasswordInput(e) { this.setData({ passwordInput: e.detail.value }); },
  onPasswordCancel() { this.setData({ showPasswordModal: false }); },
  onPasswordConfirm() {
    if (this.data.passwordInput === TEACHER_PASSWORD) {
      grantTeacherAuth();
      this.setData({ showPasswordModal: false, passwordInput: '' });
      this.loadData();
    } else {
      wx.showToast({ title: '口令错误', icon: 'error' });
    }
  },

  goToProfilePage() { wx.navigateTo({ url: '/pages/profile/profile' }); }
});