// index.js（口令授权版）
const app = getApp();
const db = wx.cloud.database();
const usersCollection = db.collection('users');
const TEACHER_PASSWORD = '333';

// 本地口令授权令牌：7天有效
function grantTeacherAuth() {
  const token = { ok: true, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  wx.setStorageSync('teacherAuth', token);
}
function isTeacherAuthed() {
  const t = wx.getStorageSync('teacherAuth');
  return !!(t && t.ok && t.exp > Date.now());
}

Page({
  data: {
    pageState: 'loading',
    userInfo: null,
    showPasswordModal: false,
    passwordInput: '',

    avatarUrl: '',
    nickname: '',
    openid: ''
  },

  onLoad() {
    this.checkLoginState();
  },

  async checkLoginState() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo._openid) {
        app.globalData.userInfo = userInfo;
        this.setData({ userInfo, pageState: 'role' });
      } else {
        this.setData({ pageState: 'auth' });
      }
    } catch {
      this.setData({ pageState: 'auth' });
    }
  },

  async handleAuth() {
    wx.showLoading({ title: '正在认证...' });
    try {
      const cloudRes = await wx.cloud.callFunction({ name: 'login' });
      const openid = cloudRes.result.openid;
      const getRes = await usersCollection.where({ _openid: openid }).get();

      if (getRes.data.length > 0) {
        const userInfo = getRes.data[0];
        wx.setStorageSync('userInfo', userInfo);
        app.globalData.userInfo = userInfo;
        this.setData({ userInfo, pageState: 'role' });
      } else {
        this.setData({ openid, pageState: 'profile' });
      }
    } catch {
      wx.showToast({ title: '认证失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onChooseAvatar(e) { this.setData({ avatarUrl: e.detail.avatarUrl }); },
  onNicknameInput(e) { this.setData({ nickname: e.detail.value }); },

  async onConfirmProfile() {
    if (!this.data.avatarUrl) return wx.showToast({ title: '请选择头像', icon: 'none' });
    if (!this.data.nickname.trim()) return wx.showToast({ title: '请输入昵称', icon: 'none' });

    wx.showLoading({ title: '正在创建档案...' });
    try {
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `avatars/${this.data.openid}-${Date.now()}.png`,
        filePath: this.data.avatarUrl,
      });
      const userData = {
        _openid: this.data.openid,
        nickName: this.data.nickname.trim(),
        avatarUrl: uploadRes.fileID,
        role: null,
        createTime: new Date()
      };
      await usersCollection.add({ data: userData });
      wx.setStorageSync('userInfo', userData);
      app.globalData.userInfo = userData;
      this.setData({ userInfo: userData, pageState: 'role' });
    } catch {
      wx.showToast({ title: '创建失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  enterAsGuest() {
    app.globalData.userInfo = { role: 'guest', nickName: '游客' };
    wx.navigateTo({ url: '/pages/practice/practice?role=guest' });
  },

  async onRoleSelect(e) {
    const role = e.currentTarget.dataset.role;
    if (role === 'teacher') {
      // 只看本地口令是否通过，不再依赖数据库角色
      if (isTeacherAuthed()) {
        this.navigateToPage('teacher');
      } else {
        this.setData({ showPasswordModal: true, passwordInput: '' });
      }
    } else {
      // 学生端按原逻辑：首次完善档案时把 role 写成 student（可选）
      if (this.data.userInfo && this.data.userInfo.role === null) {
        await this.updateUserRole('student');
      }
      this.navigateToPage('student');
    }
  },

  async onPasswordConfirm() {
    if (this.data.passwordInput === TEACHER_PASSWORD) {
      grantTeacherAuth();
      this.setData({ showPasswordModal: false, passwordInput: '' });
      this.navigateToPage('teacher');
    } else {
      wx.showToast({ title: '口令错误', icon: 'error' });
    }
  },
  onPasswordInput(e) { this.setData({ passwordInput: e.detail.value }); },
  onPasswordCancel() { this.setData({ showPasswordModal: false }); },

  // 仅用于把 null -> student（可保留/可删除）
  async updateUserRole(role) {
    const userInfo = this.data.userInfo;
    if (!userInfo) return;
    if (userInfo._id) {
      await db.collection('users').doc(userInfo._id).update({ data: { role } });
    } else {
      const res = await usersCollection.where({ _openid: userInfo._openid }).get();
      if (res.data.length > 0) {
        await usersCollection.doc(res.data[0]._id).update({ data: { role } });
      }
    }
    const updated = { ...this.data.userInfo, role };
    wx.setStorageSync('userInfo', updated);
    app.globalData.userInfo = updated;
    this.setData({ userInfo: updated });
  },

  navigateToPage(role) {
    const url = role === 'teacher' ? '/pages/teacher/teacher' : '/pages/practice/practice?role=student';
    wx.navigateTo({ url });
  }
});