// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { homeworkId } = event;

  // 参数校验
  if (!homeworkId) {
    return { success: false, message: '参数错误：缺少作业ID' };
  }

  try {
    // 第一步：查询所有角色为'student'的用户，这是我们的学生花名册
    const allStudentsRes = await db.collection('users').where({
      role: 'student'
    }).get();
    const allStudents = allStudentsRes.data;
    const allStudentOpenIds = allStudents.map(s => s._openid);

    // 第二步：查询所有完成了本次作业的记录
    const completedRecordsRes = await db.collection('homework_records').where({
      homeworkId: homeworkId,
      _openid: _.in(allStudentOpenIds) // 确保提交者是学生
    }).get();
    const completedRecords = completedRecordsRes.data;
    const completedStudentOpenIds = new Set(completedRecords.map(r => r._openid));

    // 第三步：整理数据
    // 整理已完成列表：将成绩记录和学生信息合并
    const completedList = completedRecords.map(record => {
      const studentInfo = allStudents.find(s => s._openid === record._openid);
      return {
        ...studentInfo,
        score: record.score,
        completionTime: record.completionTime.toISOString() // 转换为标准时间字符串
      };
    }).sort((a, b) => b.score - a.score); // 按分数降序

    // 整理未完成列表
    const notCompletedList = allStudents.filter(student => !completedStudentOpenIds.has(student._openid));

    return {
      success: true,
      data: {
        completed: completedList,
        notCompleted: notCompletedList
      }
    }
  } catch (e) {
    console.error("getHomeworkReport函数执行失败:", e);
    return { success: false, message: '获取学情失败' };
  }
}