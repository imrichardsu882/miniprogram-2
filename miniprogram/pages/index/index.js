// pages/index/index.js
const app = getApp();
const db = wx.cloud.database();
const usersCollection = db.collection('users');
const TEACHER_PASSWORD = '123'; // 请记得修改为您自己的正式口令

Page({
  data: {
    pageState: 'loading',
    userInfo: null,
    showPasswordModal: false,
    passwordInput: '',
    showNicknameModal: false,
    nicknameInput: '',
    tempUserInfo: null
  },

  onLoad: function () { this.checkLoginState(); },

  async checkLoginState() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo._openid) {
        app.globalData.userInfo = userInfo;
        this.setData({ userInfo, pageState: 'role' });
        return;
      }
    } catch (e) { }
    this.setData({ pageState: 'auth' });
  },

  async handleAuth() {
    try {
      const userProfile = await wx.getUserProfile({ desc: '用于创建您的学籍档案' });
      wx.showLoading({ title: '正在认证...' });
      
      const cloudRes = await wx.cloud.callFunction({ name: 'login' });
      const openid = cloudRes.result.openid;

      const getRes = await usersCollection.where({ _openid: openid }).get();

      if (getRes.data.length === 0) {
        wx.hideLoading();
        this.setData({
          showNicknameModal: true,
          nicknameInput: userProfile.userInfo.nickName,
          tempUserInfo: { ...userProfile.userInfo, _openid: openid }
        });
      } else {
        const userInfo = getRes.data[0];
        wx.setStorageSync('userInfo', userInfo);
        app.globalData.userInfo = userInfo;
        this.setData({ userInfo, pageState: 'role' });
        wx.hideLoading();
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '认证失败', icon: 'none' });
    }
  },

  enterAsGuest: function() {
    // 此功能保持不变
    app.globalData.userInfo = { role: 'guest', nickName: '游客' };
    wx.navigateTo({ url: '/pages/practice/practice?role=guest' });
  },

  async onNicknameConfirm() {
    // 此功能保持不变
    const nickname = this.data.nicknameInput.trim();
    if (!nickname) { return wx.showToast({ title: '昵称不能为空', icon: 'none' }); }
    
    wx.showLoading({ title: '正在创建档案...' });
    try {
      const userData = {
        _openid: this.data.tempUserInfo._openid,
        nickName: nickname,
        avatarUrl: this.data.tempUserInfo.avatarUrl,
        role: null,
        createTime: new Date()
      };
      await usersCollection.add({ data: userData });
      wx.setStorageSync('userInfo', userData);
      app.globalData.userInfo = userData;
      this.setData({ showNicknameModal: false, userInfo: userData, pageState: 'role' });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  // ★★★ 核心改造：选择角色时，只做判断和跳转 ★★★
  async onRoleSelect(e) {
    const role = e.currentTarget.dataset.role;

    if (role === 'teacher') {
      // 如果用户选择老师，只弹出密码框，不进行任何身份修改
      this.setData({ showPasswordModal: true, passwordInput: '' });
    } else {
      // 如果用户选择学生，且当前角色未设定，则更新角色并跳转
      if (this.data.userInfo.role === null) {
        await this.updateUserRole('student');
      }
      this.navigateToPage('student');
    }
  },
  
  // ★★★ 核心改造：认证成功后，才进行授权和跳转 ★★★
  async onPasswordConfirm() {
    if (this.data.passwordInput === TEACHER_PASSWORD) {
      wx.showLoading({ title: '正在授权...' });
      // 1. 口令正确，开始授权
      await this.updateUserRole('teacher');
      wx.hideLoading();
      // 2. 授权成功，关闭弹窗
      this.setData({ showPasswordModal: false });
      // 3. 跳转到教师主页
      this.navigateToPage('teacher');
    } else {
      wx.showToast({ title: '口令错误', icon: 'error' });
    }
  },

  // ★★★ 新增：封装一个可复用的“更新用户角色”函数 ★★★
  async updateUserRole(role) {
    try {
      await db.collection('users').doc(this.data.userInfo._openid).update({
          data: { role: role }
      });
      const updatedUserInfo = { ...this.data.userInfo, role: role };
      wx.setStorageSync('userInfo', updatedUserInfo);
      app.globalData.userInfo = updatedUserInfo;
      this.setData({ userInfo: updatedUserInfo }); // 更新当前页面的userInfo
    } catch (err) {
      console.error("更新用户角色失败", err);
      wx.showToast({ title: '身份授权失败', icon: 'none' });
    }
  },
  
  navigateToPage(role) {
    const url = role === 'teacher' ? '/pages/teacher/teacher' : '/pages/practice/practice?role=student';
    wx.navigateTo({ url });
  },

  onNicknameInput(e) { this.setData({ nicknameInput: e.detail.value }); },
  onPasswordInput(e) { this.setData({ passwordInput: e.detail.value }); },
  onPasswordCancel() { this.setData({ showPasswordModal: false }); },
  onNicknameCancel() { this.setData({ showNicknameModal: false }); },
  preventModalClose() {}
});