// miniprogram/pages/teacher/teacher.js（口令授权 + 全量作业版）
const db = wx.cloud.database();
const homeworksCollection = db.collection('homeworks');
const app = getApp();
const TEACHER_PASSWORD = '333';

// 本地口令授权令牌（默认 7 天有效）
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

  onLoad() {
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

  onShow() {
    console.log('=== Teacher 页面 onShow 触发 ===');
    console.log('当前认证状态:', isTeacherAuthed());
    console.log('当前作业列表长度:', this.data.homeworkList.length);
    
    // 只在已经认证的情况下刷新数据，避免重复认证
    if (isTeacherAuthed()) {
      // 延迟刷新，确保从其他页面返回时数据已同步
      // 移除 homeworkList.length > 0 的条件，确保即使列表为空也能刷新
      console.log('准备刷新数据...');
      // 先清空列表，强制重新渲染
      this.setData({ homeworkList: [] });
      setTimeout(() => this.loadData(), 300);
    }
  },

  // 供其他页面调用的刷新方法
  refreshHomeworkList() {
    if (isTeacherAuthed()) {
      this.loadData();
    }
  },

  // 拉取全量作业，使用云函数确保数据一致性
  async loadData() {
    console.log('=== 开始加载作业数据 ===');
    wx.showLoading({ title: '加载中...' });
    try {
      // 优先使用云函数，与 practice 页面保持一致
      const cloudRes = await wx.cloud.callFunction({ 
        name: 'listHomeworks',
        data: { forceRefresh: true } // 强制刷新，确保获取最新数据
      });
      console.log('云函数查询结果:', cloudRes);
      
      if (cloudRes && cloudRes.result && cloudRes.result.ok) {
        console.log('云函数原始数据:', cloudRes.result.data);
        const list = cloudRes.result.data.map(item => {
          console.log('处理单个作业项:', item);
          return { ...item, id: item._id };
        });
        console.log('处理后的作业列表:', list);
        console.log('每个作业的详细信息:');
        list.forEach((item, index) => {
          console.log(`作业 ${index + 1}:`, {
            id: item.id,
            name: item.name,
            wordsLength: item.words ? item.words.length : 0,
            createTime: item.createTime
          });
        });
        this.setData({ homeworkList: list });
        console.log('页面数据更新完成，当前列表长度:', this.data.homeworkList.length);
        console.log('页面当前数据:', this.data.homeworkList);
        
        // 对比测试：直接查询数据库
        try {
          const directRes = await homeworksCollection.orderBy('createTime', 'desc').get();
          console.log('=== 直接数据库查询对比 ===');
          console.log('直接查询结果数量:', directRes.data.length);
          console.log('直接查询数据:', directRes.data);
        } catch (directErr) {
          console.error('直接查询失败:', directErr);
        }
      } else {
        // 云函数失败时降级到直接数据库查询
        console.log('云函数失败，降级到直接查询');
        const res = await homeworksCollection
          .orderBy('createTime', 'desc')
          .get();
        const list = res.data.map(item => ({ ...item, id: item._id }));
        this.setData({ homeworkList: list });
      }
    } catch (err) {
      console.error('加载作业数据失败:', err);
      // 最后的降级方案：直接查询数据库
      try {
        const res = await homeworksCollection
          .orderBy('createTime', 'desc')
          .get();
        const list = res.data.map(item => ({ ...item, id: item._id }));
        this.setData({ homeworkList: list });
      } catch (fallbackErr) {
        console.error('降级查询也失败:', fallbackErr);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } finally {
      wx.hideLoading();
    }
  },

  // 返回按钮处理
  goBack: function() {
    wx.navigateBack({
      delta: 1
    });
  },

  togglePreviewMode() { this.setData({ isPreviewMode: !this.data.isPreviewMode }); },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.isPreviewMode) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}&role=preview` });
    }
  },

  goToCreatePage() { wx.navigateTo({ url: '/pages/create/create' }); },

  goToEditPage(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/create/create?id=${id}` });
  },

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
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
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
  }
});