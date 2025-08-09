const db = wx.cloud.database();
const records = db.collection('homework_records');
const users = db.collection('users');

Page({
  data: {
    isLoading: true,
    leaderboardList: [],
    timeRange: 'week', // 'week' 或 'all'
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

  // 切换时间范围
  onTimeRangeChange(e) {
    const timeRange = e.currentTarget.dataset.range;
    this.setData({ timeRange });
    this.loadLeaderboard();
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
    try {
      // 根据时间范围确定查询时间
      let since;
      if (this.data.timeRange === 'week') {
        since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 最近7天
      } else {
        since = new Date(0); // 所有时间
      }

      const recRes = await records.where({ completionTime: db.command.gte(since) }).get();
      const all = recRes.data || [];
      const byUser = new Map();
      
      // 聚合用户数据，包含更多维度
      all.forEach(r => {
        const key = r.userOpenId || r._openid;
        if (!byUser.has(key)) {
          byUser.set(key, { 
            sum: 0, 
            cnt: 0, 
            totalTime: 0, // 总用时
            consecutiveCorrect: 0, // 连续正确
            mistakeFixRate: 0, // 错题修复率
            records: [] // 详细记录
          });
        }
        const v = byUser.get(key);
        v.sum += Number(r.score || 0);
        v.cnt += 1;
        v.totalTime += Number(r.durationMs || 0);
        v.records.push(r);
        byUser.set(key, v);
      });

      // 计算更多维度
      for (const [openid, agg] of byUser.entries()) {
        // 计算连续正确次数
        let maxConsecutive = 0;
        let currentConsecutive = 0;
        agg.records.sort((a, b) => new Date(a.completionTime) - new Date(b.completionTime));
        agg.records.forEach(record => {
          if (Number(record.score) >= 80) { // 80分以上算正确
            currentConsecutive++;
            maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
          } else {
            currentConsecutive = 0;
          }
        });

        // 计算错题修复率
        let mistakeFixCount = 0;
        let totalMistakes = 0;
        agg.records.forEach(record => {
          if (record.recordType === 'mistake_review') {
            mistakeFixCount++;
          }
          if (Number(record.score) < 80) {
            totalMistakes++;
          }
        });
        const mistakeFixRate = totalMistakes > 0 ? Math.round((mistakeFixCount / totalMistakes) * 100) : 0;

        agg.consecutiveCorrect = maxConsecutive;
        agg.mistakeFixRate = mistakeFixRate;
        
        // 计算效率指数（分数/用时的综合指标）
        const avgScore = (agg.sum / agg.cnt) || 0;
        const avgTime = (agg.totalTime / agg.cnt) / 1000 / 60; // 分钟
        agg.efficiencyIndex = avgTime > 0 ? Math.round((avgScore / avgTime) * 10) : 0;
        
        // 计算稳定性比率（高分作业占比）
        const highScoreCount = agg.records.filter(r => Number(r.score) >= 80).length;
        agg.stabilityRate = Math.round((highScoreCount / agg.cnt) * 100);
        
        // 计算进步指数（最近表现vs历史表现）
        const recentRecords = agg.records.slice(-3); // 最近3次
        const recentAvg = recentRecords.reduce((sum, r) => sum + Number(r.score || 0), 0) / recentRecords.length;
        const historicalAvg = avgScore;
        agg.improvementIndex = Math.round(((recentAvg - historicalAvg) / historicalAvg) * 100) || 0;
      }

      const list = [];
      for (const [openid, agg] of byUser.entries()) {
        const avgScore = Math.round((agg.sum / agg.cnt) || 0);
        const avgTime = Math.round((agg.totalTime / agg.cnt) / 1000 / 60); // 平均用时（分钟）
        
        const u = await users.where({ _openid: openid }).get();
        const info = u.data && u.data[0] ? u.data[0] : { 
          nickName: '匿名', 
          avatarUrl: '/images/avatar.png', 
          sign: '' 
        };
        
        list.push({ 
          openid, 
          avgScore, 
          homeworkCount: agg.cnt,
          avgTime,
          consecutiveCorrect: agg.consecutiveCorrect,
          mistakeFixRate: agg.mistakeFixRate,
          efficiencyIndex: agg.efficiencyIndex,
          stabilityRate: agg.stabilityRate,
          improvementIndex: agg.improvementIndex,
          nickName: info.nickName || '匿名', 
          avatarUrl: info.avatarUrl || '/images/avatar.png', 
          sign: info.sign || '' 
        });
      }
      
      // 根据当前维度排序
      const { currentDimension, dimensionConfig } = this.data;
      list.sort(dimensionConfig[currentDimension].sortFn);
      this.setData({ leaderboardList: list });
    } catch (e) {
      console.error('排行榜加载失败:', e);
      wx.showToast({ title: '排行榜加载失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
      wx.stopPullDownRefresh();
    }
  },

  onPullDownRefresh() { this.loadLeaderboard(); }
});