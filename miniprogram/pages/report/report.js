// pages/report/report.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    homeworkId: null,
    homeworkTitle: '',
    reportData: null,
    isLoading: true,
    activeTab: 'completed'
  },

  onLoad: function (options) {
    const { id, title } = options;
    if (!id || !title) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.setData({ homeworkId: Number(id), homeworkTitle: title });
    wx.setNavigationBarTitle({ title: `“${title}”学情报告` });
    this.loadReport();
  },

  async loadReport() {
    this.setData({ isLoading: true });
    
    try {
      // 使用数据库聚合查询替代云函数，提升性能
      const homeworkId = this.data.homeworkId;
      
      // 第一步：查询所有学生用户
      const allStudentsRes = await db.collection('users').where({
        role: 'student'
      }).get();
      const allStudents = allStudentsRes.data;
      const allStudentOpenIds = allStudents.map(s => s._openid);

      // 第二步：查询完成作业的记录
      const completedRecordsRes = await db.collection('homework_records').where({
        homeworkId: homeworkId,
        _openid: _.in(allStudentOpenIds)
      }).get();
      const completedRecords = completedRecordsRes.data;
      const completedStudentOpenIds = new Set(completedRecords.map(r => r._openid));

      // 第三步：整理数据
      const completedList = completedRecords.map(record => {
        const studentInfo = allStudents.find(s => s._openid === record._openid);
        return {
          ...studentInfo,
          score: record.score,
          completionTime: record.completionTime,
          durationMs: record.durationMs || 0
        };
      }).sort((a, b) => b.score - a.score);

      const notCompletedList = allStudents.filter(student => 
        !completedStudentOpenIds.has(student._openid)
      );

      // 计算统计信息
      const stats = this.calculateStats(completedList);

      this.setData({
        reportData: {
          completed: completedList,
          notCompleted: notCompletedList,
          stats: stats
        }
      });
    } catch (error) {
      console.error('加载学情报告失败:', error);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 计算统计信息
  calculateStats(completedList) {
    if (completedList.length === 0) {
      return {
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        avgTime: 0,
        completionRate: 0
      };
    }

    const scores = completedList.map(item => Number(item.score) || 0);
    const times = completedList.map(item => Number(item.durationMs) || 0);
    
    return {
      avgScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      avgTime: Math.round(times.reduce((sum, time) => sum + time, 0) / times.length / 1000 / 60), // 分钟
      completionRate: Math.round((completedList.length / (completedList.length + this.data.reportData?.notCompleted?.length || 0)) * 100)
    };
  },

  switchTab: function(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  }
});