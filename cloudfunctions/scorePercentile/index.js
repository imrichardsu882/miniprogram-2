// 计算某次作业的分位：返回该成绩超过了多少比例（0-100）以及参与人数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { homeworkId, score } = event || {}
  if (!homeworkId || typeof score !== 'number') {
    return { ok: false, error: 'invalid params' }
  }
  try {
    const coll = db.collection('homework_records')
    const totalRes = await coll.where({ homeworkId }).count()
    const total = totalRes.total || 0
    if (total === 0) return { ok: true, total: 0, percentile: 0 }
    const lowerRes = await coll.where({ homeworkId, score: db.command.lte(score) }).count()
    const lowerEq = lowerRes.total || 0
    const percentile = Math.floor((lowerEq - 1) * 100 / total) // 排除自己，近似
    return { ok: true, total, percentile: Math.max(0, Math.min(100, percentile)) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}







