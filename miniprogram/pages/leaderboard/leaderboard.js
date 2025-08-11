const db = wx.cloud.database();
const records = db.collection('homework_records');
const users = db.collection('users');
const { CacheManager, AvatarCache } = require('../../utils/cache.js');
const { ParallelLoader, performanceMonitor } = require('../../utils/performance.js');

Page({
  data: {
    isLoading: true,
    leaderboardList: [],
    timeRange: 'all', // 只保留所有时间范围
    currentUser: null,
    currentDimension: 'score', // 'score', 'efficiency', 'stability'
    showDetailStats: false,
    // 维度配置
    dimensionConfig: {
      score: {
        subtitle: '根据平均完成率排名',
        getValue: (player) => `${player.avgScore}分`,
        description: (player) => `平均分 ${player.avgScore}分，已完成 ${player.homeworkCount} 次`,
        sortFn: (a, b) => b.avgScore - a.avgScore || b.homeworkCount - a.homeworkCount
      },
      efficiency: {
        subtitle: '根据平均用时排名（越少越好）',
        getValue: (player) => `${player.avgTime}分钟`,
        description: (player) => `平均用时 ${player.avgTime}分钟，效率指数 ${player.efficiencyIndex}`,
        sortFn: (a, b) => a.avgTime - b.avgTime || b.avgScore - a.avgScore
      },
      stability: {
        subtitle: '根据连续正确次数排名',
        getValue: (player) => `${player.consecutiveCorrect}连对`,
        description: (player) => `最高连对 ${player.consecutiveCorrect}次，稳定性 ${player.stabilityRate}%`,
        sortFn: (a, b) => b.consecutiveCorrect - a.consecutiveCorrect || b.avgScore - a.avgScore
      }
    }
  },

  onLoad() { 
    this.loadUserInfo();
    this.loadLeaderboard(); 
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    this.setData({ currentUser: userInfo });
  },



  // 切换排行维度
  onDimensionChange(e) {
    const dimension = e.currentTarget.dataset.dimension;
    this.setData({ currentDimension: dimension });
    this.sortAndUpdateList();
  },

  // 切换详细统计显示
  toggleDetailStats() {
    this.setData({ showDetailStats: !this.data.showDetailStats });
  },

  // 点击玩家查看详情
  onPlayerTap(e) {
    const player = e.currentTarget.dataset.player;
    wx.showModal({
      title: player.nickName,
      content: `平均分：${player.avgScore}分\n完成次数：${player.homeworkCount}次\n平均用时：${player.avgTime}分钟\n连续正确：${player.consecutiveCorrect}次\n错题修复率：${player.mistakeFixRate}%`,
      showCancel: false
    });
  },

  // 根据当前维度重新排序
  sortAndUpdateList() {
    const { currentDimension, dimensionConfig, leaderboardList } = this.data;
    const sortedList = [...leaderboardList].sort(dimensionConfig[currentDimension].sortFn);
    this.setData({ leaderboardList: sortedList });
  },

  async loadLeaderboard() {
    this.setData({ isLoading: true });
    performanceMonitor.start('leaderboard');
    
    try {
      // 检查缓存
      const cached = CacheManager.get('leaderboard');
      if (cached && !wx.getStorageSync('force_refresh_leaderboard')) {
        console.log('使用缓存的排行榜数据');
        this.setData({ leaderboardList: cached });
        this.setData({ isLoading: false });
        performanceMonitor.end('leaderboard');
        return;
      }

      // 并行加载数据
      const loader = new ParallelLoader();
      loader.add('records', records.limit(500).get()); // 限制查询数量
      loader.add('users', users.field({ _openid: 1, nickName: 1, avatarUrl: 1 }).get()); // 只查询需要的字段

      performanceMonitor.start('dataQuery');
      const results = await loader.execute();
      performanceMonitor.end('dataQuery');

      const allRecords = results.get('records')?.data || [];
      const allUsers = results.get('users')?.data || [];
      
      // 创建用户信息映射，提升查找性能
      const userMap = new Map();
      allUsers.forEach(user => {
        userMap.set(user._openid, {
          nickName: user.nickName || '匿名',
          avatarUrl: user.avatarUrl || '/images/avatar.png'
        });
      });

      // 聚合用户数据（优化版）
      const byUser = new Map();
      allRecords.forEach(r => {
        const key = r.userOpenId || r._openid;
        if (!byUser.has(key)) {
          byUser.set(key, { 
            sum: 0, 
            cnt: 0, 
            totalTime: 0,
            records: []
          });
        }
        const v = byUser.get(key);
        v.sum += Number(r.score || 0);
        v.cnt += 1;
        v.totalTime += Number(r.durationMs || 0);
        v.records.push({ score: r.score, completionTime: r.completionTime, recordType: r.recordType });
      });

      // 计算指标（优化版）
      const list = [];
      for (const [openid, agg] of byUser.entries()) {
        if (agg.cnt === 0) continue; // 跳过无记录用户

        const avgScore = Math.round(agg.sum / agg.cnt);
        const avgTime = Math.round(agg.totalTime / agg.cnt / 1000 / 60);
        
        // 简化指标计算，提升性能
        const sortedRecords = agg.records.sort((a, b) => new Date(a.completionTime) - new Date(b.completionTime));
        let maxConsecutive = 0;
        let current = 0;
        
        sortedRecords.forEach(record => {
          if (Number(record.score) >= 80) {
            current++;
            maxConsecutive = Math.max(maxConsecutive, current);
          } else {
            current = 0;
          }
        });

        const userInfo = userMap.get(openid) || { nickName: '匿名', avatarUrl: '/images/avatar.png' };
        
        list.push({ 
          openid, 
          avgScore, 
          homeworkCount: agg.cnt,
          avgTime,
          consecutiveCorrect: maxConsecutive,
          mistakeFixRate: 0, // 简化计算，提升性能
          efficiencyIndex: avgTime > 0 ? Math.round((avgScore / avgTime) * 10) : 0,
          stabilityRate: Math.round((sortedRecords.filter(r => Number(r.score) >= 80).length / agg.cnt) * 100),
          improvementIndex: 0, // 简化计算，提升性能
          nickName: userInfo.nickName, 
          avatarUrl: userInfo.avatarUrl
        });
      }
      
              // 临时禁用云头像处理，统一使用默认头像
        performanceMonitor.start('avatarResolve');
        list.forEach(item => {
          // 暂时统一使用默认头像，避免403错误
          item.avatarUrl = '/images/avatar.png';
        });
        performanceMonitor.end('avatarResolve');

      // 排序
      const { currentDimension, dimensionConfig } = this.data;
      list.sort(dimensionConfig[currentDimension].sortFn);

      // 缓存结果
      CacheManager.set('leaderboard', list);
      
      this.setData({ leaderboardList: list });
    } catch (e) {
      console.error('排行榜加载失败:', e);
      wx.showToast({ title: '排行榜加载失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
      wx.stopPullDownRefresh();
      wx.removeStorageSync('force_refresh_leaderboard');
      performanceMonitor.end('leaderboard');
    }
  },

  // 将 cloud:// 文件ID 批量转换为临时URL
  async resolveAvatarUrls(list) {
    try {
      const fileIds = (list || [])
        .map(p => p.avatarUrl)
        .filter(u => typeof u === 'string' && u.indexOf('cloud://') === 0);
      if (!fileIds.length) return list;
      const res = await wx.cloud.getTempFileURL({ fileList: fileIds });
      const idToUrl = new Map();
      (res.fileList || []).forEach(item => {
        idToUrl.set(item.fileID, item.tempFileURL || '');
      });
      return (list || []).map(p => {
        if (typeof p.avatarUrl === 'string' && p.avatarUrl.indexOf('cloud://') === 0) {
          const url = idToUrl.get(p.avatarUrl);
          p.avatarUrl = url || '/images/avatar.png';
        }
        return p;
      });
    } catch (e) {
      // 任何异常时使用默认头像，避免红错
      return (list || []).map(p => ({ ...p, avatarUrl: p.avatarUrl || '/images/avatar.png' }));
    }
  },

  onPullDownRefresh() { 
    // 强制刷新，跳过缓存
    wx.setStorageSync('force_refresh_leaderboard', true);
    this.loadLeaderboard(); 
  }
});