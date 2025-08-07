// index.js (最终·功能完整版)
const app = getApp();
const db = wx.cloud.database();
const usersCollection = db.collection('users');
const TEACHER_PASSWORD = '333'; 

Page({
  data: {
    pageState: 'loading',
    userInfo: null,
    showPasswordModal: false,
    passwordInput: '', // 确保 passwordInput 字段存在
    
    avatarUrl: '',
    nickname: '',
    openid: ''
  },

  onLoad: function () {
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
    } catch (e) {
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
    } catch (err) {
      wx.showToast({ title: '认证失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  // ★★★ 核心修正：恢复被意外删除的 onNicknameInput 函数 ★★★
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },
  
  async onConfirmProfile() {
    if (!this.data.avatarUrl) { return wx.showToast({ title: '请选择头像', icon: 'none' }); }
    if (!this.data.nickname.trim()) { return wx.showToast({ title: '请输入昵称', icon: 'none' }); }

    wx.showLoading({ title: '正在创建档案...' });

    try {
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `avatars/${this.data.openid}-${Date.now()}.png`,
        filePath: this.data.avatarUrl,
      });

      const cloudAvatarUrl = uploadRes.fileID;

      const userData = {
        _openid: this.data.openid,
        nickName: this.data.nickname.trim(),
        avatarUrl: cloudAvatarUrl,
        role: null,
        createTime: new Date()
      };

      await usersCollection.add({ data: userData });
      
      wx.setStorageSync('userInfo', userData);
      app.globalData.userInfo = userData;
      
      this.setData({ userInfo: userData, pageState: 'role' }); 

    } catch (err) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  enterAsGuest: function() {
    app.globalData.userInfo = { role: 'guest', nickName: '游客' };
    wx.navigateTo({ url: '/pages/practice/practice?role=guest' });
  },

  async onRoleSelect(e) {
    const role = e.currentTarget.dataset.role;
    if (role === 'teacher') {
      if (this.data.userInfo.role === 'teacher') {
        this.navigateToPage('teacher');
      } else {
        this.setData({ showPasswordModal: true, passwordInput: '' });
      }
    } else {
      if (this.data.userInfo.role === null) {
        await this.updateUserRole('student');
      }
      this.navigateToPage('student');
    }
  },
  
  async onPasswordConfirm() {
    if (this.data.passwordInput === TEACHER_PASSWORD) {
      wx.showLoading({ title: '正在授权...' });
      try {
        await this.updateUserRole('teacher');
        this.setData({ showPasswordModal: false });
        this.navigateToPage('teacher');
      } catch(e) {
        wx.showToast({ title: '授权失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    } else {
      wx.showToast({ title: '口令错误', icon: 'error' });
    }
  },
  
  async updateUserRole(role) {
    await db.collection('users').doc(this.data.userInfo._openid).update({ data: { role: role } });
    const updatedUserInfo = { ...this.data.userInfo, role: role };
    wx.setStorageSync('userInfo', updatedUserInfo);
    app.globalData.userInfo = updatedUserInfo;
    this.setData({ userInfo: updatedUserInfo });
  },

  navigateToPage(role) {
    const url = role === 'teacher' ? '/pages/teacher/teacher' : '/pages/practice/practice?role=student';
    wx.navigateTo({ url }); 
  },
  
  // ★★★ 核心修正：恢复被意外删除的 onPasswordInput 函数 ★★★
  onPasswordInput(e) {
    this.setData({
      passwordInput: e.detail.value
    });
  },
  
  onPasswordCancel() { this.setData({ showPasswordModal: false }); },
});