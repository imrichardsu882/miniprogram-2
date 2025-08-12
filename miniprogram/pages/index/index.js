// index.js（口令授权版）
const app = getApp();
const db = wx.cloud.database();
const usersCollection = db.collection('users');
const { CacheManager, AvatarCache } = require('../../utils/cache.js');
const { ParallelLoader, performanceMonitor, BatchSetData } = require('../../utils/performance.js');
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
    openid: '',

    // 红点提示相关
    hasLeaderboardUpdate: false,
    hasTeacherUpdate: false,
    hasUnreadUpdates: false,
    unreadCount: 0,
    
    // 版本更新相关
    updates: [
      {
        id: 1,
        title: '新增智能发音功能',
        description: '支持自动发音和发音重试机制，提升学习体验',
        read: false,
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 // 2天前
      },
      {
        id: 2,
        title: '优化答题交互体验',
        description: '改进错误反馈机制，支持重试和继续功能',
        read: false,
        timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000 // 1天前
      },
      {
        id: 3,
        title: '界面设计全面升级',
        description: '采用现代化iOS/MIUI设计风格，提升视觉体验',
        read: true,
        timestamp: Date.now() - 12 * 60 * 60 * 1000 // 12小时前
      }
    ]
  },

  onLoad() {
    console.log('=== 主页加载开始 ===');
    // 初始化批量setData工具
    this.batchSetData = new BatchSetData(this);
    performanceMonitor.start('indexLoad');
    this.checkLoginState();
    this.checkUpdateStatus();
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
        
        // 先设置默认头像，避免空白显示
        const userInfoWithDefaultAvatar = {
          ...userInfo,
          avatarUrl: userInfo.avatarUrl || '/images/avatar.png'
        };
        
        this.setData({ userInfo: userInfoWithDefaultAvatar, pageState: 'role' }, () => {
          // 如果是云头像，异步转换
          if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
            this.handleAvatarDisplay(userInfo.avatarUrl);
          }
        });
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

  // 加载用户学习统计（优化版）
  async loadUserStats(openid) {
    try {
      // 检查缓存
      const cacheKey = `userStats_${openid}`;
      const cached = CacheManager.get(cacheKey);
      if (cached) {
        console.log('使用缓存的用户统计');
        this.batchSetData.add({ userStats: cached });
        return;
      }

      // 设置默认统计数据
      const defaultStats = {
        totalHomeworks: 0,
        avgScore: 0,
        totalTime: '0分钟',
        bestRank: '暂无'
      };
      
      this.batchSetData.add({ userStats: defaultStats });
      
      // 验证 openid 参数
      if (!openid || typeof openid !== 'string') {
        console.warn('无效的 openid，跳过统计查询');
        return;
      }
      
      performanceMonitor.start('userStats');
      
      // 优化查询：只获取需要的字段
      const records = db.collection('homework_records');
      const recordsRes = await records.where({ 
        userOpenId: openid 
      })
      .field({ score: 1, durationMs: 1, createTime: 1 }) // 只查询需要的字段
      .orderBy('createTime', 'desc')
      .limit(50) // 减少查询数量，提升性能
      .get();
      
      const userRecords = recordsRes.data || [];
      
      if (userRecords.length > 0) {
        // 计算统计数据
        const totalHomeworks = userRecords.length;
        const totalScore = userRecords.reduce((sum, record) => sum + (Number(record.score) || 0), 0);
        const avgScore = Math.round(totalScore / totalHomeworks);
        const totalTimeMs = userRecords.reduce((sum, record) => sum + (Number(record.durationMs) || 0), 0);
        const totalTimeMinutes = Math.round(totalTimeMs / 1000 / 60);
        
        const stats = {
          totalHomeworks,
          avgScore,
          totalTime: `${totalTimeMinutes}分钟`,
          bestRank: '计算中...'
        };

        // 缓存结果
        CacheManager.set(cacheKey, stats);
        
        this.batchSetData.add({ userStats: stats });
        
        console.log('用户统计加载成功:', { totalHomeworks, avgScore, totalTimeMinutes });
      } else {
        console.log('用户暂无作业记录');
        // 缓存默认数据，避免重复查询
        CacheManager.set(cacheKey, defaultStats, 10); // 10分钟缓存
      }
      
      performanceMonitor.end('userStats');
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
        // 新用户直接使用微信信息创建档案
        const userInfo = {
          _openid: openid,
          nickName: 'WeChat用户', // 默认昵称
          avatarUrl: '/images/avatar.png', // 默认头像
          createTime: db.serverDate()
        };
        
        try {
          const result = await usersCollection.add({ data: userInfo });
          userInfo._id = result._id;
          app.globalData.userInfo = userInfo;
          this.setData({ userInfo, pageState: 'role' });
          console.log('新用户档案创建成功');
        } catch (createError) {
          console.error('创建用户档案失败:', createError);
          wx.showToast({ title: '创建档案失败', icon: 'none' });
        }
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
    if (this.data.choosingAvatar) return;
    this.setData({ choosingAvatar: true });
    try {
      const url = e.detail && e.detail.avatarUrl;
      if (url) {
        this.setData({ avatarUrl: url });
      } else {
        console.warn('用户取消选择头像');
      }
    } catch (err) {
      console.error('chooseAvatar 处理失败:', err);
    } finally {
      setTimeout(() => this.setData({ choosingAvatar: false }), 300);
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
      // 直接跳转到角色选择，不再提供个人资料编辑
      this.setData({ pageState: 'role' });
    } else {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }
  },

  preventModalClose() {
    // 阻止弹窗关闭
  },

  // 简化的头像显示处理：暂时禁用云头像，统一使用默认头像
  async handleAvatarDisplay(avatarUrl) {
    try {
      console.log('开始处理头像显示:', avatarUrl);
      const tempFileURL = await wx.cloud.getTempFileURL({
        fileList: [avatarUrl]
      });
      console.log('获取临时文件URL结果:', tempFileURL);
      
      if (tempFileURL.fileList && tempFileURL.fileList[0] && tempFileURL.fileList[0].tempFileURL) {
        const tempUrl = tempFileURL.fileList[0].tempFileURL;
        console.log('临时URL:', tempUrl);
        
        this.setData({
          'userInfo.avatarUrl': tempUrl
        });
        console.log('头像URL更新完成');
      }
    } catch (error) {
      console.error('处理头像显示失败:', error);
      // 如果转换失败，使用默认头像
      this.setData({
        'userInfo.avatarUrl': '/images/avatar.png'
      });
    }
  },

  // 检查更新状态和红点提示
  checkUpdateStatus() {
    // 检查排行榜更新
    this.checkLeaderboardUpdate();
    // 检查教师功能更新
    this.checkTeacherUpdate();
    // 检查版本更新
    this.checkVersionUpdates();
  },

  // 检查排行榜更新
  checkLeaderboardUpdate() {
    // 模拟检查排行榜是否有新数据
    const lastVisit = wx.getStorageSync('lastLeaderboardVisit') || 0;
    const now = Date.now();
    const hasUpdate = (now - lastVisit) > 24 * 60 * 60 * 1000; // 24小时内有更新
    
    this.setData({
      hasLeaderboardUpdate: hasUpdate
    });
  },

  // 检查教师功能更新
  checkTeacherUpdate() {
    // 模拟检查教师功能是否有新内容
    const lastVisit = wx.getStorageSync('lastTeacherVisit') || 0;
    const now = Date.now();
    const hasUpdate = (now - lastVisit) > 7 * 24 * 60 * 60 * 1000; // 7天内有更新
    
    this.setData({
      hasTeacherUpdate: hasUpdate
    });
  },

  // 检查版本更新
  checkVersionUpdates() {
    const updates = this.data.updates;
    const hasUnread = updates.some(update => !update.read);
    const unreadCount = updates.filter(update => !update.read).length;
    
    this.setData({
      hasUnreadUpdates: hasUnread,
      unreadCount: unreadCount
    });
  },

  // 查看版本更新详情
  viewUpdate(e) {
    const updateId = e.currentTarget.dataset.id;
    const updates = this.data.updates.map(update => {
      if (update.id === updateId) {
        return { ...update, read: true };
      }
      return update;
    });
    
    this.setData({ updates });
    this.checkVersionUpdates();
    
    // 显示更新详情
    const update = updates.find(u => u.id === updateId);
    if (update) {
      wx.showModal({
        title: update.title,
        content: update.description,
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  // 显示设置页面
  showSettings() {
    wx.showActionSheet({
      itemList: ['清除缓存', '关于我们', '意见反馈'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.clearCache();
            break;
          case 1:
            this.showAbout();
            break;
          case 2:
            this.showFeedback();
            break;
        }
      }
    });
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存数据吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({
            title: '缓存已清除',
            icon: 'success'
          });
        }
      }
    });
  },

  // 显示关于页面
  showAbout() {
    wx.showModal({
      title: '关于三通英语助手',
      content: '版本：1.0.0\n\n一个专为师生设计的智能英语学习工具，让学习更高效，让进步更可见。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 显示反馈页面
  showFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '如有问题或建议，请联系开发团队。\n\n邮箱：feedback@example.com',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});