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
    userStats: null,

    avatarUrl: '',
    nickname: '',
    sign: '',
    openid: ''
  },

  onLoad() {
    console.log('=== 主页加载开始 ===');
    this.checkLoginState();
  },

  async checkLoginState() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo._openid) {
        console.log('用户信息:', userInfo);
        console.log('用户头像URL:', userInfo.avatarUrl);
        
        // 检查头像URL的有效性
        if (userInfo.avatarUrl) {
          console.log('头像URL类型:', typeof userInfo.avatarUrl);
          console.log('头像URL长度:', userInfo.avatarUrl.length);
          if (userInfo.avatarUrl.startsWith('cloud://')) {
            console.log('检测到云存储头像');
          } else if (userInfo.avatarUrl.startsWith('/images/')) {
            console.log('检测到本地默认头像');
          } else {
            console.log('检测到其他类型头像URL');
          }
        } else {
          console.log('用户头像URL为空，将使用默认头像');
        }
        
        app.globalData.userInfo = userInfo;
        console.log('设置页面状态为 role，用户信息:', userInfo);
        this.setData({ userInfo, pageState: 'role' });
        console.log('页面数据设置完成，当前 userInfo:', this.data.userInfo);
        this.loadUserStats(userInfo._openid);
      } else {
        this.setData({ pageState: 'auth' });
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
      this.setData({ pageState: 'auth' });
    }
  },

  // 加载用户学习统计
  async loadUserStats(openid) {
    try {
      // 设置默认统计数据
      const defaultStats = {
        totalHomeworks: 0,
        avgScore: 0,
        totalTime: '0分钟',
        bestRank: '暂无'
      };
      
      this.setData({ userStats: defaultStats });
      
      // 验证 openid 参数
      if (!openid || typeof openid !== 'string') {
        console.warn('无效的 openid，跳过统计查询');
        return;
      }
      
      // 尝试加载真实数据，添加更多查询优化
      const records = db.collection('homework_records');
      const recordsRes = await records.where({ 
        userOpenId: openid 
      })
      .orderBy('createTime', 'desc') // 按时间排序
      .limit(100) // 限制查询数量
      .get();
      
      const userRecords = recordsRes.data || [];
      
      if (userRecords.length > 0) {
        // 计算统计数据
        const totalHomeworks = userRecords.length;
        const totalScore = userRecords.reduce((sum, record) => sum + (Number(record.score) || 0), 0);
        const avgScore = totalHomeworks > 0 ? Math.round(totalScore / totalHomeworks) : 0;
        const totalTimeMs = userRecords.reduce((sum, record) => sum + (Number(record.durationMs) || 0), 0);
        const totalTimeMinutes = Math.round(totalTimeMs / 1000 / 60);
        
        this.setData({
          userStats: {
            totalHomeworks,
            avgScore,
            totalTime: `${totalTimeMinutes}分钟`,
            bestRank: '计算中...'
          }
        });
        
        console.log('用户统计加载成功:', { totalHomeworks, avgScore, totalTimeMinutes });
      } else {
        console.log('用户暂无作业记录');
      }
    } catch (error) {
      console.warn('加载用户统计失败，使用默认数据:', error);
      // 保持默认数据，不显示错误给用户
    }
  },

  async handleAuth() {
    wx.showLoading({ title: '正在认证...' });
    try {
      const cloudRes = await wx.cloud.callFunction({ name: 'login' });
      
      if (!cloudRes.result || !cloudRes.result.openid) {
        throw new Error('获取用户信息失败');
      }
      
      const openid = cloudRes.result.openid;
      console.log('获取到的openid:', openid);
      
      const getRes = await usersCollection.where({ _openid: openid }).limit(1).get();

      if (getRes.data.length > 0) {
        const userInfo = getRes.data[0];
        wx.setStorageSync('userInfo', userInfo);
        app.globalData.userInfo = userInfo;
        this.setData({ userInfo, pageState: 'role' });
        console.log('用户认证成功:', userInfo.nickName);
      } else {
        this.setData({ openid, pageState: 'profile' });
        console.log('新用户，需要完善资料');
      }
    } catch (error) {
      console.error('认证失败:', error);
      wx.showToast({ 
        title: error.message || '认证失败，请重试', 
        icon: 'none',
        duration: 2000
      });
    } finally {
      wx.hideLoading();
    }
  },

  onChooseAvatar(e) { 
    console.log('选择头像结果:', e.detail);
    if (e.detail.avatarUrl) {
      this.setData({ avatarUrl: e.detail.avatarUrl });
    } else {
      console.warn('用户取消选择头像');
    }
  },
  onNicknameInput(e) { this.setData({ nickname: e.detail.value }); },
  onSignInput(e) { this.setData({ sign: e.detail.value }); },

  async onConfirmProfile() {
    if (!this.data.avatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }
    if (!this.data.nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    const isEditing = this.data.userInfo && this.data.userInfo._id;
    wx.showLoading({ title: isEditing ? '正在更新资料...' : '正在创建档案...' });
    
    try {
      let avatarUrl = this.data.avatarUrl;
      
      // 如果头像是本地路径，需要上传到云存储
      if (this.data.avatarUrl.startsWith('http://tmp/') || this.data.avatarUrl.startsWith('wxfile://') || this.data.avatarUrl.startsWith('http://')) {
        try {
          console.log('开始上传头像:', this.data.avatarUrl);
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${this.data.openid || this.data.userInfo._openid}-${Date.now()}.png`,
            filePath: this.data.avatarUrl,
          });
          avatarUrl = uploadRes.fileID;
          console.log('头像上传成功:', avatarUrl);
        } catch (uploadError) {
          console.error('头像上传失败:', uploadError);
          // 如果上传失败，使用默认头像
          avatarUrl = '/images/avatar.png';
          wx.showToast({ title: '头像上传失败，使用默认头像', icon: 'none' });
        }
      }

      const userData = {
        nickName: this.data.nickname.trim(),
        avatarUrl: avatarUrl,
        sign: this.data.sign || '',
      };

      if (isEditing) {
        // 更新现有用户
        await usersCollection.doc(this.data.userInfo._id).update({ data: userData });
        const updatedUserInfo = { ...this.data.userInfo, ...userData };
        wx.setStorageSync('userInfo', updatedUserInfo);
        app.globalData.userInfo = updatedUserInfo;
        this.setData({ userInfo: updatedUserInfo, pageState: 'role' });
      } else {
        // 创建新用户
        const newUserData = {
          ...userData,
          _openid: this.data.openid,
          role: null,
          createTime: new Date()
        };
        await usersCollection.add({ data: newUserData });
        wx.setStorageSync('userInfo', newUserData);
        app.globalData.userInfo = newUserData;
        this.setData({ userInfo: newUserData, pageState: 'role' });
      }
      
      wx.showToast({ title: isEditing ? '更新成功' : '创建成功', icon: 'success' });
    } catch (error) {
      console.error('Profile update error:', error);
      wx.showToast({ title: isEditing ? '更新失败' : '创建失败', icon: 'none' });
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
  },

  goLeaderboard() { wx.navigateTo({ url: '/pages/leaderboard/leaderboard' }); },

  editProfile() {
    // 返回到个人资料编辑页面
    const userInfo = this.data.userInfo;
    if (userInfo) {
      this.setData({
        pageState: 'profile',
        avatarUrl: userInfo.avatarUrl || '',
        nickname: userInfo.nickName || '',
        sign: userInfo.sign || ''
      });
    } else {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }
  },

  preventModalClose() {
    // 阻止弹窗关闭
  }
});